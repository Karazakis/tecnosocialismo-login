import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  loginPool?: Pool;
  loginMessageSchema?: Promise<void>;
};

export const pool =
  globalForDatabase.loginPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.loginPool = pool;
}

export function ensureMessageSchema() {
  if (!globalForDatabase.loginMessageSchema) {
    globalForDatabase.loginMessageSchema = pool.query(`
      CREATE TABLE IF NOT EXISTS message_conversations (
        id uuid PRIMARY KEY,
        kind text NOT NULL CHECK (kind IN ('direct', 'group', 'notes')),
        title text,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS message_members (
        conversation_id uuid NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_read_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS message_items (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
        sender_id text NOT NULL,
        sender_name text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS message_members_user_idx ON message_members(user_id);
      CREATE INDEX IF NOT EXISTS message_items_conversation_idx ON message_items(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS message_conversations_updated_idx ON message_conversations(updated_at DESC);
    `).then(() => undefined).catch((error) => {
      globalForDatabase.loginMessageSchema = undefined;
      throw error;
    });
  }
  return globalForDatabase.loginMessageSchema;
}
