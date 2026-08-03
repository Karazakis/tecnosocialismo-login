import { ensureMilitantSchema, pool } from "@/db";
import { getRequestUser } from "@/lib/request-user";

export type MilitantRole = "owner" | "admin" | "coordinator" | "contributor" | "observer";
export type MilitantMember = {
  id: string;
  name: string;
  email: string;
  role: MilitantRole;
  status: "active" | "suspended";
  areas: string[];
  addedAt: string;
  level: number;
  points: number;
};

export type MilitantActor = MilitantMember & { permissions: string[] };
export type TaskStatus = "backlog" | "planned" | "in_progress" | "review" | "done" | "blocked";
export type TaskCategory = "portali" | "comunicazione" | "territorio" | "organizzazione" | "ricerca" | "eventi" | "amministrazione";
export type Priority = "low" | "medium" | "high" | "critical";

const roleRank: Record<MilitantRole, number> = { observer: 0, contributor: 1, coordinator: 2, admin: 3, owner: 4 };
const roles = Object.keys(roleRank) as MilitantRole[];
const taskStatuses: TaskStatus[] = ["backlog", "planned", "in_progress", "review", "done", "blocked"];
const categories: TaskCategory[] = ["portali", "comunicazione", "territorio", "organizzazione", "ricerca", "eventi", "amministrazione"];
const priorities: Priority[] = ["low", "medium", "high", "critical"];
const feedbackStatuses = ["new", "triaged", "planned", "resolved", "closed"] as const;
const feedbackKinds = ["feedback", "bug", "report", "idea"] as const;

export async function requireMilitant(request: Request, minimum: MilitantRole = "observer"): Promise<MilitantActor> {
  await ensureMilitantSchema();
  const user = await getRequestUser(request);
  if (!user) throw new MilitantError("Accedi con il tuo account Tecnosocialismo.", 401, "UNAUTHENTICATED");
  const result = await pool.query<{
    user_id: string; name: string | null; email: string; role: MilitantRole; status: "active" | "suspended"; areas: string[]; added_at: Date | string; level: number; points: number;
  }>(`
    SELECT m.user_id, u.name, u.email, m.role, m.status, m.areas, m.added_at, m.level, m.points
    FROM militant_members m JOIN "user" u ON u.id = m.user_id
    WHERE m.user_id = $1
  `, [user.id]);
  const row = result.rows[0];
  if (!row || row.status !== "active") throw new MilitantError("Il tuo account non è abilitato a questo portale.", 403, "NOT_ENABLED");
  if (roleRank[row.role] < roleRank[minimum]) throw new MilitantError("Non hai il permesso necessario.", 403, "FORBIDDEN");
  return {
    id: row.user_id,
    name: row.name || row.email.split("@")[0],
    email: row.email,
    role: row.role,
    status: row.status,
    areas: row.areas,
    addedAt: iso(row.added_at),
    level: Number(row.level ?? 1),
    points: Number(row.points ?? 0),
    permissions: permissionsFor(row.role),
  };
}

export async function dashboard() {
  await ensureMilitantSchema();
  const [taskCounts, feedbackCounts, memberCount, recentAudit] = await Promise.all([
    pool.query<{ total: string; open: string; progress: string; review: string; done: string; blocked: string; critical: string }>(`
      SELECT count(*)::text total,
        count(*) FILTER (WHERE status NOT IN ('done'))::text open,
        count(*) FILTER (WHERE status = 'in_progress')::text progress,
        count(*) FILTER (WHERE status = 'review')::text review,
        count(*) FILTER (WHERE status = 'done')::text done,
        count(*) FILTER (WHERE status = 'blocked')::text blocked,
        count(*) FILTER (WHERE priority = 'critical' AND status <> 'done')::text critical
      FROM militant_tasks
    `),
    pool.query<{ total: string; open: string; bugs: string; new_count: string }>(`
      SELECT count(*)::text total,
        count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::text open,
        count(*) FILTER (WHERE kind = 'bug' AND status NOT IN ('resolved','closed'))::text bugs,
        count(*) FILTER (WHERE status = 'new')::text new_count
      FROM militant_feedback
    `),
    pool.query<{ count: string }>("SELECT count(*)::text count FROM militant_members WHERE status = 'active'"),
    pool.query<{ id: string; actor_name: string; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: Date | string }>(`
      SELECT id, actor_name, action, entity_type, entity_id, details, created_at
      FROM militant_audit ORDER BY created_at DESC LIMIT 20
    `),
  ]);
  return {
    tasks: numberRecord(taskCounts.rows[0]),
    feedback: numberRecord(feedbackCounts.rows[0]),
    activeMembers: Number(memberCount.rows[0]?.count ?? 0),
    recentActivity: recentAudit.rows.map((row) => ({ id: row.id, actorName: row.actor_name, action: row.action, entityType: row.entity_type, entityId: row.entity_id, details: row.details, createdAt: iso(row.created_at) })),
  };
}

export async function listTasks() {
  await ensureMilitantSchema();
  const result = await pool.query(`
    SELECT t.id, t.title, t.description, t.category, t.status, t.priority, t.assignee_id,
      assignee.name assignee_name, assignee.email assignee_email,
      t.created_by, creator.name creator_name, t.due_date, t.tags, t.created_at, t.updated_at,
      (SELECT count(*)::int FROM militant_task_comments c WHERE c.task_id = t.id) comment_count
    FROM militant_tasks t
    LEFT JOIN "user" assignee ON assignee.id = t.assignee_id
    LEFT JOIN "user" creator ON creator.id = t.created_by
    ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.updated_at DESC
    LIMIT 1000
  `);
  return result.rows.map(publicTask);
}

export async function createTask(actor: MilitantActor, input: Record<string, unknown>) {
  const title = safeText(input.title, 180);
  if (!title) throw new MilitantError("Il titolo della task è obbligatorio.", 400);
  const category = oneOf(input.category, categories, "portali");
  const status = oneOf(input.status, taskStatuses, "backlog");
  const priority = oneOf(input.priority, priorities, "medium");
  const assigneeId = await validAssignee(input.assigneeId);
  const task = {
    id: crypto.randomUUID(), title, description: safeText(input.description, 8000), category, status, priority,
    assigneeId, dueDate: safeDate(input.dueDate), tags: safeArray(input.tags, 12, 32),
  };
  await pool.query(`
    INSERT INTO militant_tasks (id, title, description, category, status, priority, assignee_id, created_by, due_date, tags)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [task.id, task.title, task.description, task.category, task.status, task.priority, task.assigneeId, actor.id, task.dueDate, task.tags]);
  await audit(actor, "task.created", "task", task.id, { title: task.title, category: task.category });
  return (await taskById(task.id))!;
}

export async function updateTask(actor: MilitantActor, id: string, input: Record<string, unknown>) {
  assertUuid(id);
  const current = await taskRecord(id);
  if (!current) throw new MilitantError("Task non trovata.", 404);
  if (roleRank[actor.role] < roleRank.coordinator) {
    if (actor.role !== "contributor" || current.assignee_id !== actor.id) throw new MilitantError("Puoi aggiornare soltanto le task assegnate a te.", 403);
    const status = oneOf(input.status, taskStatuses, current.status as TaskStatus);
    await pool.query("UPDATE militant_tasks SET status=$2, updated_at=now() WHERE id=$1", [id, status]);
    await audit(actor, "task.status_changed", "task", id, { status });
    return (await taskById(id))!;
  }
  const title = input.title === undefined ? current.title : safeText(input.title, 180);
  if (!title) throw new MilitantError("Il titolo della task è obbligatorio.", 400);
  const values = {
    title,
    description: input.description === undefined ? current.description : safeText(input.description, 8000),
    category: oneOf(input.category, categories, current.category as TaskCategory),
    status: oneOf(input.status, taskStatuses, current.status as TaskStatus),
    priority: oneOf(input.priority, priorities, current.priority as Priority),
    assigneeId: input.assigneeId === undefined ? current.assignee_id : await validAssignee(input.assigneeId),
    dueDate: input.dueDate === undefined ? current.due_date : safeDate(input.dueDate),
    tags: input.tags === undefined ? current.tags : safeArray(input.tags, 12, 32),
  };
  await pool.query(`UPDATE militant_tasks SET title=$2,description=$3,category=$4,status=$5,priority=$6,assignee_id=$7,due_date=$8,tags=$9,updated_at=now() WHERE id=$1`,
    [id, values.title, values.description, values.category, values.status, values.priority, values.assigneeId, values.dueDate, values.tags]);
  await audit(actor, "task.updated", "task", id, { title: values.title, status: values.status });
  return (await taskById(id))!;
}

export async function deleteTask(actor: MilitantActor, id: string) {
  assertUuid(id);
  const task = await taskRecord(id);
  if (!task) throw new MilitantError("Task non trovata.", 404);
  await pool.query("DELETE FROM militant_tasks WHERE id=$1", [id]);
  await audit(actor, "task.deleted", "task", id, { title: task.title });
}

export async function listComments(taskId: string) {
  assertUuid(taskId);
  const result = await pool.query<{ id: string; author_id: string; author_name: string; body: string; created_at: Date | string }>(`
    SELECT id, author_id, author_name, body, created_at FROM militant_task_comments WHERE task_id=$1 ORDER BY created_at
  `, [taskId]);
  return result.rows.map((row) => ({ id: row.id, authorId: row.author_id, authorName: row.author_name, body: row.body, createdAt: iso(row.created_at) }));
}

export async function addComment(actor: MilitantActor, taskId: string, value: unknown) {
  assertUuid(taskId);
  if (!await taskRecord(taskId)) throw new MilitantError("Task non trovata.", 404);
  const body = safeText(value, 3000);
  if (!body) throw new MilitantError("Scrivi un commento.", 400);
  const id = crypto.randomUUID();
  await pool.query("INSERT INTO militant_task_comments (id,task_id,author_id,author_name,body) VALUES ($1,$2,$3,$4,$5)", [id, taskId, actor.id, actor.name, body]);
  await pool.query("UPDATE militant_tasks SET updated_at=now() WHERE id=$1", [taskId]);
  await audit(actor, "task.commented", "task", taskId, {});
  return { id, authorId: actor.id, authorName: actor.name, body, createdAt: new Date().toISOString() };
}

export async function listFeedback() {
  await ensureMilitantSchema();
  const result = await pool.query(`SELECT id,service,kind,title,description,status,priority,reporter_id,reporter_name,created_at,updated_at FROM militant_feedback ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1000`);
  return result.rows.map(publicFeedback);
}

export async function createFeedback(actor: MilitantActor, input: Record<string, unknown>) {
  const title = safeText(input.title, 180);
  if (!title) throw new MilitantError("Il titolo della segnalazione è obbligatorio.", 400);
  const item = {
    id: crypto.randomUUID(), service: safeText(input.service, 60) || "Generale",
    kind: oneOf(input.kind, feedbackKinds, "feedback"), title,
    description: safeText(input.description, 8000), priority: oneOf(input.priority, priorities, "medium"),
  };
  await pool.query(`INSERT INTO militant_feedback (id,service,kind,title,description,priority,reporter_id,reporter_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [item.id, item.service, item.kind, item.title, item.description, item.priority, actor.id, actor.name]);
  await audit(actor, "feedback.created", "feedback", item.id, { title: item.title, kind: item.kind });
  return (await feedbackById(item.id))!;
}

export async function updateFeedback(actor: MilitantActor, id: string, input: Record<string, unknown>) {
  assertUuid(id);
  const current = await feedbackRecord(id);
  if (!current) throw new MilitantError("Segnalazione non trovata.", 404);
  const status = oneOf(input.status, feedbackStatuses, current.status as typeof feedbackStatuses[number]);
  const priority = oneOf(input.priority, priorities, current.priority as Priority);
  const service = input.service === undefined ? current.service : safeText(input.service, 60) || "Generale";
  await pool.query("UPDATE militant_feedback SET status=$2,priority=$3,service=$4,updated_at=now() WHERE id=$1", [id, status, priority, service]);
  await audit(actor, "feedback.updated", "feedback", id, { status, priority });
  return (await feedbackById(id))!;
}

export async function listMembers() {
  await ensureMilitantSchema();
  const result = await pool.query<{ user_id: string; name: string | null; email: string; role: MilitantRole; status: "active" | "suspended"; areas: string[]; added_at: Date | string; level: number; points: number }>(`
    SELECT m.user_id,u.name,u.email,m.role,m.status,m.areas,m.added_at,m.level,m.points FROM militant_members m JOIN "user" u ON u.id=m.user_id
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'coordinator' THEN 2 WHEN 'contributor' THEN 3 ELSE 4 END, lower(u.name)
  `);
  return result.rows.map(memberFromRow);
}

export async function addMember(actor: MilitantActor, input: Record<string, unknown>) {
  const email = safeText(input.email, 320).toLocaleLowerCase("en-US");
  if (!email) throw new MilitantError("Inserisci l’email dell’account.", 400);
  const role = oneOf(input.role, roles, "contributor");
  assertAssignableRole(actor, role);
  const user = await pool.query<{ id: string }>("SELECT id FROM \"user\" WHERE lower(email)=$1", [email]);
  if (!user.rows[0]) throw new MilitantError("Questa email non corrisponde a un account Tecnosocialismo.", 404);
  const areas = safeArray(input.areas, 12, 40);
  await pool.query(`
    INSERT INTO militant_members (user_id,role,status,areas,added_by) VALUES ($1,$2,'active',$3,$4)
    ON CONFLICT (user_id) DO UPDATE SET role=$2,status='active',areas=$3,updated_at=now()
  `, [user.rows[0].id, role, areas, actor.id]);
  await audit(actor, "member.enabled", "member", user.rows[0].id, { role, email });
  return (await listMembers()).find((item) => item.id === user.rows[0].id)!;
}

export async function updateMember(actor: MilitantActor, userId: string, input: Record<string, unknown>) {
  const current = await pool.query<{ role: MilitantRole }>("SELECT role FROM militant_members WHERE user_id=$1", [userId]);
  if (!current.rows[0]) throw new MilitantError("Membro non trovato.", 404);
  if (current.rows[0].role === "owner" || userId === actor.id) throw new MilitantError("Il proprietario e il proprio account non si modificano da qui.", 403);
  const role = oneOf(input.role, roles, current.rows[0].role);
  assertAssignableRole(actor, role);
  const status = input.status === "suspended" ? "suspended" : "active";
  const areas = input.areas === undefined ? undefined : safeArray(input.areas, 12, 40);
  await pool.query("UPDATE militant_members SET role=$2,status=$3,areas=COALESCE($4,areas),updated_at=now() WHERE user_id=$1", [userId, role, status, areas ?? null]);
  await audit(actor, "member.updated", "member", userId, { role, status });
  return (await listMembers()).find((item) => item.id === userId)!;
}

export async function audit(actor: Pick<MilitantActor, "id" | "name">, action: string, entityType: string, entityId: string | null, details: Record<string, unknown>) {
  await pool.query("INSERT INTO militant_audit (id,actor_id,actor_name,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [crypto.randomUUID(), actor.id, actor.name, action, entityType, entityId, JSON.stringify(details)]);
}

function permissionsFor(role: MilitantRole) {
  const common = ["dashboard:view", "tasks:view", "feedback:view", "services:view", "members:view"];
  if (role === "observer") return common;
  const contributor = [...common, "tasks:comment", "tasks:update-own", "feedback:create"];
  if (role === "contributor") return contributor;
  const coordinator = [...contributor, "tasks:create", "tasks:manage", "feedback:manage"];
  if (role === "coordinator") return coordinator;
  const admin = [...coordinator, "tasks:delete", "members:manage"];
  if (role === "admin") return admin;
  return [...admin, "owners:manage"];
}

function assertAssignableRole(actor: MilitantActor, role: MilitantRole) {
  if (actor.role === "owner") return;
  if (actor.role !== "admin" || role === "owner" || role === "admin") throw new MilitantError("Non puoi assegnare questo ruolo.", 403);
}

async function validAssignee(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") throw new MilitantError("Assegnatario non valido.", 400);
  const result = await pool.query("SELECT 1 FROM militant_members WHERE user_id=$1 AND status='active'", [value]);
  if (!result.rowCount) throw new MilitantError("L’assegnatario non è un membro attivo.", 400);
  return value;
}

async function taskRecord(id: string) { return (await pool.query("SELECT * FROM militant_tasks WHERE id=$1", [id])).rows[0] as Record<string, unknown> | undefined; }
async function feedbackRecord(id: string) { return (await pool.query("SELECT * FROM militant_feedback WHERE id=$1", [id])).rows[0] as Record<string, unknown> | undefined; }
async function taskById(id: string) {
  const result = await pool.query(`SELECT t.id,t.title,t.description,t.category,t.status,t.priority,t.assignee_id,assignee.name assignee_name,assignee.email assignee_email,t.created_by,creator.name creator_name,t.due_date,t.tags,t.created_at,t.updated_at,(SELECT count(*)::int FROM militant_task_comments c WHERE c.task_id=t.id) comment_count FROM militant_tasks t LEFT JOIN "user" assignee ON assignee.id=t.assignee_id LEFT JOIN "user" creator ON creator.id=t.created_by WHERE t.id=$1`, [id]);
  return result.rows[0] ? publicTask(result.rows[0]) : null;
}
async function feedbackById(id: string) { const row = (await pool.query("SELECT * FROM militant_feedback WHERE id=$1", [id])).rows[0]; return row ? publicFeedback(row) : null; }

function publicTask(row: Record<string, unknown>) {
  return { id: row.id, title: row.title, description: row.description, category: row.category, status: row.status, priority: row.priority,
    assigneeId: row.assignee_id, assigneeName: row.assignee_name ?? null, assigneeEmail: row.assignee_email ?? null,
    creatorId: row.created_by, creatorName: row.creator_name ?? "Account", dueDate: row.due_date ? dateOnly(row.due_date) : null,
    tags: row.tags ?? [], commentCount: Number(row.comment_count ?? 0), createdAt: iso(row.created_at as Date | string), updatedAt: iso(row.updated_at as Date | string) };
}
function publicFeedback(row: Record<string, unknown>) { return { id: row.id, service: row.service, kind: row.kind, title: row.title, description: row.description, status: row.status, priority: row.priority, reporterId: row.reporter_id ?? null, reporterName: row.reporter_name ?? "Sistema", createdAt: iso(row.created_at as Date | string), updatedAt: iso(row.updated_at as Date | string) }; }
function memberFromRow(row: { user_id: string; name: string | null; email: string; role: MilitantRole; status: "active" | "suspended"; areas: string[]; added_at: Date | string; level: number; points: number }): MilitantMember { return { id: row.user_id, name: row.name || row.email.split("@")[0], email: row.email, role: row.role, status: row.status, areas: row.areas, addedAt: iso(row.added_at), level: Number(row.level ?? 1), points: Number(row.points ?? 0) }; }
function safeText(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim().slice(0, max) : ""; }
function safeArray(value: unknown, maxItems: number, maxLength: number) { if (!Array.isArray(value)) return []; return [...new Set(value.map((item) => safeText(item, maxLength)).filter(Boolean))].slice(0, maxItems); }
function safeDate(value: unknown) { if (value === null || value === "") return null; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new MilitantError("Data non valida.", 400); return value; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback; }
function assertUuid(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new MilitantError("Identificativo non valido.", 400); }
function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function dateOnly(value: unknown) { if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value).slice(0, 10); }
function numberRecord(value: Record<string, string> | undefined) { return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key === "new_count" ? "new" : key, Number(item)])); }

export class MilitantError extends Error {
  constructor(message: string, public status: number, public code = "ERROR") { super(message); }
}
