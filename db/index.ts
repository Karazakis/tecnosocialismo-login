import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  loginPool?: Pool;
  loginMessageSchema?: Promise<void>;
  loginMilitantSchema?: Promise<void>;
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

export function ensureMilitantSchema() {
  if (!globalForDatabase.loginMilitantSchema) {
    globalForDatabase.loginMilitantSchema = pool.query(`
      CREATE TABLE IF NOT EXISTS militant_members (
        user_id text PRIMARY KEY,
        role text NOT NULL CHECK (role IN ('owner', 'admin', 'coordinator', 'contributor', 'observer')),
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        areas text[] NOT NULL DEFAULT '{}',
        added_by text,
        added_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS militant_tasks (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        category text NOT NULL CHECK (category IN ('portali', 'comunicazione', 'territorio', 'organizzazione', 'ricerca', 'eventi', 'amministrazione')),
        status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'planned', 'in_progress', 'review', 'done', 'blocked')),
        priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        assignee_id text,
        created_by text NOT NULL,
        due_date date,
        tags text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS militant_task_comments (
        id uuid PRIMARY KEY,
        task_id uuid NOT NULL REFERENCES militant_tasks(id) ON DELETE CASCADE,
        author_id text NOT NULL,
        author_name text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS militant_feedback (
        id uuid PRIMARY KEY,
        service text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('feedback', 'bug', 'report', 'idea')),
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'planned', 'resolved', 'closed')),
        priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        reporter_id text,
        reporter_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS militant_audit (
        id uuid PRIMARY KEY,
        actor_id text NOT NULL,
        actor_name text NOT NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text,
        details jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS militant_tasks_status_idx ON militant_tasks(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS militant_tasks_assignee_idx ON militant_tasks(assignee_id, status);
      CREATE INDEX IF NOT EXISTS militant_feedback_status_idx ON militant_feedback(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS militant_audit_created_idx ON militant_audit(created_at DESC);
    `).then(async () => {
      const ownerEmail = process.env.MILITANT_OWNER_EMAIL?.trim().toLocaleLowerCase("en-US");
      if (!ownerEmail) return;
      await pool.query(`
        INSERT INTO militant_members (user_id, role, status, areas, added_by)
        SELECT id, 'owner', 'active', ARRAY['tutto']::text[], id
        FROM "user" WHERE lower(email) = $1
        ON CONFLICT (user_id) DO UPDATE SET role = 'owner', status = 'active', updated_at = now()
      `, [ownerEmail]);
    }).catch((error) => {
      globalForDatabase.loginMilitantSchema = undefined;
      throw error;
    });
  }
  return globalForDatabase.loginMilitantSchema;
}
