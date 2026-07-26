import type { PoolClient } from "pg";
import { ensureMessageSchema as ensureSchema, pool } from "@/db";
export type SuiteUser = { id: string; name: string; email: string };

export type ConversationMember = {
  id: string;
  name: string;
  email: string;
};

export type ConversationSummary = {
  id: string;
  kind: "direct" | "group" | "notes";
  title: string;
  members: ConversationMember[];
  updatedAt: string;
  unreadCount: number;
  lastMessage: {
    body: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
};

export type PublicMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  kind: ConversationSummary["kind"];
  title: string | null;
  updated_at: Date | string;
};

export async function listConversations(user: SuiteUser): Promise<ConversationSummary[]> {
  await ensureSchema();
  await ensureNotes(user);
  const conversations = await pool.query<ConversationRow>(`
    SELECT c.id, c.kind, c.title, c.updated_at
    FROM message_conversations c
    JOIN message_members mine ON mine.conversation_id = c.id
    WHERE mine.user_id = $1
    ORDER BY c.updated_at DESC
  `, [user.id]);
  if (!conversations.rowCount) return [];

  const ids = conversations.rows.map((item) => item.id);
  const [membersResult, messagesResult, unreadResult] = await Promise.all([
    pool.query<{ conversation_id: string; id: string; name: string | null; email: string }>(`
      SELECT mm.conversation_id, u.id, u.name, u.email
      FROM message_members mm
      JOIN "user" u ON u.id = mm.user_id
      WHERE mm.conversation_id = ANY($1::uuid[])
      ORDER BY mm.joined_at
    `, [ids]),
    pool.query<{ conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: Date | string }>(`
      SELECT DISTINCT ON (conversation_id)
        conversation_id, sender_id, sender_name, body, created_at
      FROM message_items
      WHERE conversation_id = ANY($1::uuid[])
      ORDER BY conversation_id, created_at DESC
    `, [ids]),
    pool.query<{ conversation_id: string; count: string }>(`
      SELECT mm.conversation_id, count(mi.id)::text AS count
      FROM message_members mm
      LEFT JOIN message_items mi
        ON mi.conversation_id = mm.conversation_id
        AND mi.created_at > mm.last_read_at
        AND mi.sender_id <> mm.user_id
      WHERE mm.user_id = $1 AND mm.conversation_id = ANY($2::uuid[])
      GROUP BY mm.conversation_id
    `, [user.id, ids]),
  ]);

  const members = new Map<string, ConversationMember[]>();
  for (const row of membersResult.rows) {
    const current = members.get(row.conversation_id) ?? [];
    current.push({ id: row.id, name: row.name || row.email.split("@")[0], email: row.email });
    members.set(row.conversation_id, current);
  }
  const lastMessages = new Map(messagesResult.rows.map((row) => [row.conversation_id, {
    body: row.body,
    senderId: row.sender_id,
    senderName: row.sender_name,
    createdAt: iso(row.created_at),
  }]));
  const unread = new Map(unreadResult.rows.map((row) => [row.conversation_id, Number(row.count)]));

  return conversations.rows.map((row) => {
    const conversationMembers = members.get(row.id) ?? [];
    return {
      id: row.id,
      kind: row.kind,
      title: conversationTitle(row.kind, row.title, conversationMembers, user.id),
      members: conversationMembers,
      updatedAt: iso(row.updated_at),
      unreadCount: unread.get(row.id) ?? 0,
      lastMessage: lastMessages.get(row.id) ?? null,
    };
  });
}

export async function createConversation(user: SuiteUser, input: { emails: string[]; title?: string }) {
  await ensureSchema();
  const emails = [...new Set(input.emails.map(normalizeEmail).filter(Boolean))]
    .filter((email) => email !== normalizeEmail(user.email))
    .slice(0, 19);
  if (!emails.length) throw new MessageError("Inserisci lâ€™email di almeno unâ€™altra persona.", 400);

  const result = await pool.query<{ id: string; name: string | null; email: string }>(`
    SELECT id, name, email FROM "user" WHERE lower(email) = ANY($1::text[])
  `, [emails]);
  const byEmail = new Map(result.rows.map((row) => [normalizeEmail(row.email), row]));
  const missing = emails.filter((email) => !byEmail.has(email));
  if (missing.length) throw new MessageError(`Nessun account trovato per ${missing.join(", ")}.`, 404);

  const people = emails.map((email) => byEmail.get(email)!);
  if (people.length === 1) {
    const existing = await pool.query<{ id: string }>(`
      SELECT c.id
      FROM message_conversations c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM message_members m WHERE m.conversation_id = c.id AND m.user_id = $1)
        AND EXISTS (SELECT 1 FROM message_members m WHERE m.conversation_id = c.id AND m.user_id = $2)
        AND (SELECT count(*) FROM message_members m WHERE m.conversation_id = c.id) = 2
      LIMIT 1
    `, [user.id, people[0].id]);
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const kind = people.length === 1 ? "direct" : "group";
  const title = kind === "group" ? safeText(input.title, 80) || null : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = crypto.randomUUID();
    await client.query(`
      INSERT INTO message_conversations (id, kind, title, created_by)
      VALUES ($1, $2, $3, $4)
    `, [id, kind, title, user.id]);
    await addMember(client, id, user.id);
    for (const person of people) await addMember(client, id, person.id);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listMessages(conversationId: string, user: SuiteUser): Promise<PublicMessage[]> {
  await ensureSchema();
  await assertMember(conversationId, user.id);
  const result = await pool.query<{
    id: string; conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: Date | string;
  }>(`
    SELECT id, conversation_id, sender_id, sender_name, body, created_at
    FROM (
      SELECT id, conversation_id, sender_id, sender_name, body, created_at
      FROM message_items
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 200
    ) recent
    ORDER BY created_at ASC
  `, [conversationId]);
  await markConversationRead(conversationId, user.id);
  return result.rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: iso(row.created_at),
  }));
}

export async function sendMessage(conversationId: string, user: SuiteUser, value: unknown): Promise<PublicMessage> {
  await ensureSchema();
  await assertMember(conversationId, user.id);
  const body = safeText(value, 4000);
  if (!body) throw new MessageError("Scrivi un messaggio prima di inviare.", 400);
  const message: PublicMessage = {
    id: crypto.randomUUID(),
    conversationId,
    senderId: user.id,
    senderName: user.name,
    body,
    createdAt: new Date().toISOString(),
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO message_items (id, conversation_id, sender_id, sender_name, body, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [message.id, conversationId, user.id, user.name, body, message.createdAt]);
    await client.query("UPDATE message_conversations SET updated_at = $2 WHERE id = $1", [conversationId, message.createdAt]);
    await client.query("UPDATE message_members SET last_read_at = $3 WHERE conversation_id = $1 AND user_id = $2", [conversationId, user.id, message.createdAt]);
    await client.query("COMMIT");
    return message;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markConversationRead(conversationId: string, userId: string) {
  await ensureSchema();
  const result = await pool.query(`
    UPDATE message_members SET last_read_at = now()
    WHERE conversation_id = $1 AND user_id = $2
  `, [conversationId, userId]);
  if (!result.rowCount) throw new MessageError("Conversazione non disponibile.", 404);
}

async function ensureNotes(user: SuiteUser) {
  const existing = await pool.query<{ id: string }>(`
    SELECT c.id FROM message_conversations c
    JOIN message_members m ON m.conversation_id = c.id
    WHERE c.kind = 'notes' AND m.user_id = $1 LIMIT 1
  `, [user.id]);
  if (existing.rows[0]) return existing.rows[0].id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = crypto.randomUUID();
    await client.query(`INSERT INTO message_conversations (id, kind, title, created_by) VALUES ($1, 'notes', 'Note personali', $2)`, [id, user.id]);
    await addMember(client, id, user.id);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function assertMember(conversationId: string, userId: string) {
  if (!isUuid(conversationId)) throw new MessageError("Conversazione non valida.", 400);
  const result = await pool.query("SELECT 1 FROM message_members WHERE conversation_id = $1 AND user_id = $2", [conversationId, userId]);
  if (!result.rowCount) throw new MessageError("Conversazione non disponibile.", 404);
}

async function addMember(client: PoolClient, conversationId: string, userId: string) {
  await client.query("INSERT INTO message_members (conversation_id, user_id) VALUES ($1, $2)", [conversationId, userId]);
}

function conversationTitle(kind: ConversationSummary["kind"], storedTitle: string | null, members: ConversationMember[], viewerId: string) {
  if (kind === "notes") return "Note personali";
  if (kind === "group") return storedTitle || members.filter((item) => item.id !== viewerId).map((item) => item.name).join(", ");
  return members.find((item) => item.id !== viewerId)?.name || "Conversazione";
}

function safeText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US").slice(0, 320) : "";
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class MessageError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}


