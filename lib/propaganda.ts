import { ensurePropagandaSchema, pool } from "@/db";
import { audit, requireMilitant, type MilitantActor, type MilitantRole } from "@/lib/militant";

const roleRank: Record<MilitantRole, number> = { observer: 0, contributor: 1, coordinator: 2, admin: 3, owner: 4 };
const contentStatuses = ["draft", "review", "approved", "scheduled", "published", "archived"] as const;
const eventStatuses = ["draft", "approved", "published", "completed", "cancelled"] as const;
const channelStatuses = ["draft", "connected", "paused"] as const;
const formats = ["card", "post", "thread", "video", "message"] as const;
const contentTypes = ["political", "editorial", "community"] as const;
const activityKinds = ["share", "event", "outreach", "report", "production"] as const;
const pointValues: Record<(typeof activityKinds)[number], number> = { share: 3, event: 20, outreach: 8, report: 5, production: 12 };

export type PropagandaActor = MilitantActor & { propagandaPermissions: string[] };

export async function requirePropaganda(request: Request, minimum: MilitantRole = "observer"): Promise<PropagandaActor> {
  await ensurePropagandaSchema();
  const actor = await requireMilitant(request, minimum);
  if (actor.level < 1) throw new PropagandaError("Completa il livello 1 su Militant per accedere alla cabina.", 403, "LEVEL_REQUIRED");
  return { ...actor, propagandaPermissions: permissionsFor(actor.role) };
}

export async function publicPortal() {
  await ensurePropagandaSchema();
  const [contentResult, eventResult, metrics] = await Promise.all([
    pool.query(`SELECT id,format,content_type,title,body,call_to_action,political_disclosure,channels,scheduled_at,metrics,created_at
      FROM propaganda_content WHERE status='published' ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT 12`),
    pool.query(`SELECT id,social_event_id,title,description,propaganda_component,location,starts_at,channels
      FROM propaganda_events WHERE status IN ('approved','published') AND starts_at > now() - interval '1 day' ORDER BY starts_at LIMIT 8`),
    metricSummary(),
  ]);
  const content = contentResult.rows.length ? contentResult.rows.map(publicContent) : seedContent;
  const events = eventResult.rows.length ? eventResult.rows.map(publicEvent) : seedEvents;
  return {
    content,
    events,
    metrics: {
      ...metrics,
      published: Math.max(metrics.published, content.length),
      activeEvents: Math.max(metrics.activeEvents, events.length),
    },
    territories: [
      { name: "Rete digitale", reach: Math.min(100, 62 + Math.round(metrics.interactions / 80)), trend: "+12%" },
      { name: "Comunità locali", reach: Math.min(100, 41 + metrics.activeEvents * 3), trend: "+8%" },
      { name: "Luoghi di lavoro e studio", reach: Math.min(100, 28 + Math.round(metrics.shares / 30)), trend: "+5%" },
    ],
  };
}

export async function propagandaDashboard(actor: PropagandaActor) {
  const [campaigns, content, events, channels, activities, metrics] = await Promise.all([
    pool.query("SELECT * FROM propaganda_campaigns ORDER BY updated_at DESC LIMIT 100"),
    pool.query("SELECT * FROM propaganda_content ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT 300"),
    pool.query("SELECT * FROM propaganda_events ORDER BY starts_at DESC LIMIT 150"),
    pool.query("SELECT * FROM propaganda_channels ORDER BY updated_at DESC LIMIT 100"),
    pool.query("SELECT * FROM propaganda_activity ORDER BY created_at DESC LIMIT 200"),
    metricSummary(),
  ]);
  return {
    actor,
    metrics,
    campaigns: campaigns.rows.map(campaignRow),
    content: content.rows.map(contentRow),
    events: events.rows.map(eventRow),
    channels: channels.rows.map(channelRow),
    activities: activities.rows.map(activityRow),
  };
}

export async function propagandaAction(actor: PropagandaActor, input: Record<string, unknown>) {
  const action = text(input.action, 60);
  if (action === "create-campaign") {
    requireRole(actor, "coordinator");
    const title = required(input.title, 180, "Inserisci il nome della campagna.");
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO propaganda_campaigns(id,title,objective,audience,status,created_by) VALUES($1,$2,$3,$4,$5,$6)", [id, title, text(input.objective, 4000), text(input.audience, 800), oneOf(input.status, ["draft", "active", "paused", "completed"] as const, "draft"), actor.id]);
    await audit(actor, "propaganda.campaign_created", "propaganda_campaign", id, { title });
    return { message: "Campagna creata.", id };
  }
  if (action === "create-content") {
    requireRole(actor, "contributor");
    const title = required(input.title, 180, "Inserisci il titolo del contenuto.");
    const contentType = oneOf(input.contentType, contentTypes, "political");
    const disclosure = contentType === "political" ? true : Boolean(input.politicalDisclosure);
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO propaganda_content(id,campaign_id,format,content_type,title,body,call_to_action,political_disclosure,status,channels,scheduled_at,author_id,author_name)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, uuidOrNull(input.campaignId), oneOf(input.format, formats, "post"), contentType, title, text(input.body, 12000), text(input.callToAction, 500), disclosure, oneOf(input.status, contentStatuses, "draft"), list(input.channels, 12), dateOrNull(input.scheduledAt), actor.id, actor.name]);
    await audit(actor, "propaganda.content_created", "propaganda_content", id, { title, contentType });
    return { message: "Contenuto aggiunto alla scaletta.", id };
  }
  if (action === "update-content") {
    requireRole(actor, "coordinator");
    const id = uuid(input.id);
    const current = (await pool.query("SELECT content_type FROM propaganda_content WHERE id=$1", [id])).rows[0];
    if (!current) throw new PropagandaError("Contenuto non trovato.", 404);
    const status = oneOf(input.status, contentStatuses, "draft");
    await pool.query("UPDATE propaganda_content SET status=$2,scheduled_at=COALESCE($3,scheduled_at),channels=CASE WHEN cardinality($4::text[])>0 THEN $4 ELSE channels END,political_disclosure=CASE WHEN content_type='political' THEN true ELSE political_disclosure END,updated_at=now() WHERE id=$1", [id, status, dateOrNull(input.scheduledAt), list(input.channels, 12)]);
    await audit(actor, "propaganda.content_updated", "propaganda_content", id, { status });
    return { message: "Stato editoriale aggiornato." };
  }
  if (action === "create-channel") {
    requireRole(actor, "coordinator");
    const name = required(input.name, 160, "Inserisci il nome della pagina o del gruppo.");
    const id = crypto.randomUUID();
    const mix = normalizeMix(input.editorialMix);
    await pool.query(`INSERT INTO propaganda_channels(id,name,platform,external_handle,mode,status,cadence,auto_generation,editorial_mix,transparency_note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, name, required(input.platform, 80, "Seleziona la piattaforma."), text(input.externalHandle, 240), oneOf(input.mode, ["manual", "oauth", "opt-in-feed"] as const, "manual"), oneOf(input.status, channelStatuses, "draft"), text(input.cadence, 300), Boolean(input.autoGeneration), JSON.stringify(mix), text(input.transparencyNote, 1000), actor.id]);
    await audit(actor, "propaganda.channel_created", "propaganda_channel", id, { name, mix });
    return { message: "Publisher registrato.", id };
  }
  if (action === "update-channel") {
    requireRole(actor, "coordinator");
    const id = uuid(input.id);
    await pool.query("UPDATE propaganda_channels SET status=$2,cadence=COALESCE(NULLIF($3,''),cadence),auto_generation=$4,editorial_mix=$5,updated_at=now() WHERE id=$1", [id, oneOf(input.status, channelStatuses, "paused"), text(input.cadence, 300), Boolean(input.autoGeneration), JSON.stringify(normalizeMix(input.editorialMix))]);
    await audit(actor, "propaganda.channel_updated", "propaganda_channel", id, {});
    return { message: "Publisher aggiornato." };
  }
  if (action === "create-event") {
    requireRole(actor, "contributor");
    const title = required(input.title, 180, "Inserisci il titolo dell’evento.");
    const id = crypto.randomUUID();
    const startsAt = dateOrNull(input.startsAt);
    if (!startsAt) throw new PropagandaError("Inserisci data e ora dell’evento.", 400);
    await pool.query(`INSERT INTO propaganda_events(id,social_event_id,title,description,propaganda_component,location,starts_at,status,channels,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, text(input.socialEventId, 180) || null, title, text(input.description, 5000), text(input.propagandaComponent, 2000), text(input.location, 500), startsAt, oneOf(input.status, eventStatuses, "draft"), list(input.channels, 12), actor.id]);
    await audit(actor, "propaganda.event_created", "propaganda_event", id, { title });
    return { message: "Evento inserito nel piano di diffusione.", id };
  }
  if (action === "update-event") {
    requireRole(actor, "coordinator");
    const id = uuid(input.id);
    const status = oneOf(input.status, eventStatuses, "draft");
    await pool.query("UPDATE propaganda_events SET status=$2,channels=CASE WHEN cardinality($3::text[])>0 THEN $3 ELSE channels END,updated_at=now() WHERE id=$1", [id, status, list(input.channels, 12)]);
    await audit(actor, "propaganda.event_updated", "propaganda_event", id, { status });
    return { message: "Evento aggiornato." };
  }
  if (action === "record-metrics") {
    requireRole(actor, "coordinator");
    const id = uuid(input.id);
    const metrics = { impressions: integer(input.impressions), interactions: integer(input.interactions), shares: integer(input.shares), clicks: integer(input.clicks) };
    await pool.query("UPDATE propaganda_content SET metrics=$2,updated_at=now() WHERE id=$1", [id, JSON.stringify(metrics)]);
    await audit(actor, "propaganda.metrics_recorded", "propaganda_content", id, metrics);
    return { message: "Metriche registrate." };
  }
  if (action === "log-activity") {
    requireRole(actor, "contributor");
    const kind = oneOf(input.kind, activityKinds, "share");
    const title = required(input.title, 220, "Descrivi l’attività svolta.");
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO propaganda_activity(id,actor_id,actor_name,kind,title,evidence,points) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, actor.id, actor.name, kind, title, text(input.evidence, 2000), pointValues[kind]]);
    await audit(actor, "propaganda.activity_submitted", "propaganda_activity", id, { kind, points: pointValues[kind] });
    return { message: "Attività inviata alla verifica.", id };
  }
  if (action === "verify-activity") {
    requireRole(actor, "coordinator");
    const id = uuid(input.id);
    const status = input.approved === false ? "rejected" : "verified";
    const row = (await pool.query("SELECT actor_id,points,status FROM propaganda_activity WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!row) throw new PropagandaError("Attività non trovata.", 404);
    if (row.status !== "pending") throw new PropagandaError("Questa attività è già stata verificata.", 409);
    await pool.query("UPDATE propaganda_activity SET status=$2,verified_by=$3,verified_at=now() WHERE id=$1", [id, status, actor.id]);
    if (status === "verified") await pool.query("UPDATE militant_members SET points=points+$2,level=GREATEST(level,1+floor((points+$2)/250)::int),updated_at=now() WHERE user_id=$1", [row.actor_id, row.points]);
    await audit(actor, "propaganda.activity_verified", "propaganda_activity", id, { status, points: status === "verified" ? row.points : 0 });
    return { message: status === "verified" ? "Attività verificata e punti Militant assegnati." : "Attività respinta." };
  }
  throw new PropagandaError("Azione non riconosciuta.", 400);
}

async function metricSummary() {
  const result = await pool.query<{ published: string; impressions: string; interactions: string; shares: string; clicks: string; active_events: string; connected_channels: string }>(`
    SELECT
      (SELECT count(*) FROM propaganda_content WHERE status='published')::text published,
      COALESCE((SELECT sum((metrics->>'impressions')::bigint) FROM propaganda_content),0)::text impressions,
      COALESCE((SELECT sum((metrics->>'interactions')::bigint) FROM propaganda_content),0)::text interactions,
      COALESCE((SELECT sum((metrics->>'shares')::bigint) FROM propaganda_content),0)::text shares,
      COALESCE((SELECT sum((metrics->>'clicks')::bigint) FROM propaganda_content),0)::text clicks,
      (SELECT count(*) FROM propaganda_events WHERE status IN ('approved','published') AND starts_at>now())::text active_events,
      (SELECT count(*) FROM propaganda_channels WHERE status='connected')::text connected_channels
  `);
  const row = result.rows[0];
  return { published: Number(row?.published ?? 0), impressions: Number(row?.impressions ?? 0), interactions: Number(row?.interactions ?? 0), shares: Number(row?.shares ?? 0), clicks: Number(row?.clicks ?? 0), activeEvents: Number(row?.active_events ?? 0), connectedChannels: Number(row?.connected_channels ?? 0) };
}

function permissionsFor(role: MilitantRole) {
  const common = ["public:view", "analytics:view"];
  if (role === "observer") return common;
  const contributor = [...common, "content:create", "events:create", "activity:submit"];
  if (role === "contributor") return contributor;
  const coordinator = [...contributor, "content:review", "schedule:manage", "publishers:manage", "activity:verify"];
  if (role === "coordinator") return coordinator;
  return [...coordinator, "campaigns:manage", "settings:manage"];
}

function requireRole(actor: PropagandaActor, minimum: MilitantRole) { if (roleRank[actor.role] < roleRank[minimum]) throw new PropagandaError("Non hai il livello di permesso necessario.", 403); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : ""; }
function required(value: unknown, max: number, message: string) { const result = text(value, max); if (!result) throw new PropagandaError(message, 400); return result; }
function list(value: unknown, max: number) { const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []; return [...new Set(values.map((item) => text(item, 80)).filter(Boolean))].slice(0, max); }
function integer(value: unknown) { const result = Number(value); return Number.isFinite(result) ? Math.max(0, Math.round(result)) : 0; }
function uuid(value: unknown) { const result = text(value, 40); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new PropagandaError("Identificativo non valido.", 400); return result; }
function uuidOrNull(value: unknown) { if (!value) return null; return uuid(value); }
function dateOrNull(value: unknown) { if (!value || typeof value !== "string") return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new PropagandaError("Data non valida.", 400); return date.toISOString(); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback; }
function normalizeMix(value: unknown) { const source = typeof value === "object" && value ? value as Record<string, unknown> : {}; const political = Math.min(100, integer(source.political ?? 40)); const editorial = Math.min(100 - political, integer(source.editorial ?? 40)); return { political, editorial, community: Math.max(0, 100 - political - editorial) }; }
function iso(value: Date | string | null) { return value ? new Date(value).toISOString() : null; }
function campaignRow(row: Record<string, unknown>) { return { id: row.id, title: row.title, objective: row.objective, audience: row.audience, status: row.status, createdAt: iso(row.created_at as Date | string), updatedAt: iso(row.updated_at as Date | string) }; }
function contentRow(row: Record<string, unknown>) { return { id: row.id, campaignId: row.campaign_id, format: row.format, contentType: row.content_type, title: row.title, body: row.body, callToAction: row.call_to_action, politicalDisclosure: row.political_disclosure, status: row.status, channels: row.channels ?? [], scheduledAt: iso(row.scheduled_at as Date | string | null), authorId: row.author_id, authorName: row.author_name, metrics: row.metrics ?? {}, createdAt: iso(row.created_at as Date | string), updatedAt: iso(row.updated_at as Date | string) }; }
function eventRow(row: Record<string, unknown>) { return { id: row.id, socialEventId: row.social_event_id, title: row.title, description: row.description, propagandaComponent: row.propaganda_component, location: row.location, startsAt: iso(row.starts_at as Date | string), status: row.status, channels: row.channels ?? [] }; }
function channelRow(row: Record<string, unknown>) { return { id: row.id, name: row.name, platform: row.platform, externalHandle: row.external_handle, mode: row.mode, status: row.status, cadence: row.cadence, autoGeneration: row.auto_generation, editorialMix: row.editorial_mix, transparencyNote: row.transparency_note }; }
function activityRow(row: Record<string, unknown>) { return { id: row.id, actorId: row.actor_id, actorName: row.actor_name, kind: row.kind, title: row.title, evidence: row.evidence, status: row.status, points: row.points, createdAt: iso(row.created_at as Date | string), verifiedAt: iso(row.verified_at as Date | string | null) }; }
function publicContent(row: Record<string, unknown>) { const item = contentRow(row); return { ...item, campaignId: undefined, authorId: undefined, status: undefined }; }
function publicEvent(row: Record<string, unknown>) { const item = eventRow(row); return { ...item, status: undefined }; }

const seedContent = [
  { id: "seed-1", format: "card", contentType: "political", title: "La tecnologia deve liberare tempo, non consumarlo.", body: "Automazione e capacità scientifica possono ridurre il lavoro necessario e ampliare ciò che scegliamo di fare insieme.", callToAction: "Condividi l’idea", politicalDisclosure: true, channels: ["Social", "Telegram"], scheduledAt: new Date().toISOString(), metrics: { impressions: 18400, interactions: 1260, shares: 388, clicks: 640 }, createdAt: new Date().toISOString() },
  { id: "seed-2", format: "post", contentType: "editorial", title: "Cosa significa organizzare i bisogni reali?", body: "Un dato utile non è quello che sorveglia: è quello che permette a una comunità di capire cosa manca e come produrlo.", callToAction: "Leggi il manifesto", politicalDisclosure: true, channels: ["Social"], scheduledAt: new Date().toISOString(), metrics: { impressions: 9600, interactions: 740, shares: 206, clicks: 410 }, createdAt: new Date().toISOString() },
  { id: "seed-3", format: "card", contentType: "community", title: "Una rete cresce quando le persone possono usarla davvero.", body: "Portali aperti, strumenti comuni, formazione accessibile e organizzazione territoriale.", callToAction: "Scopri i portali", politicalDisclosure: true, channels: ["Instagram", "Messaggi"], scheduledAt: new Date().toISOString(), metrics: { impressions: 12100, interactions: 930, shares: 274, clicks: 502 }, createdAt: new Date().toISOString() },
];
const seedEvents = [
  { id: "event-seed-1", socialEventId: null, title: "Assemblea aperta: tecnologia e bisogni", description: "Incontro pubblico con laboratorio sui servizi digitali comuni.", propagandaComponent: "Presentazione del progetto e distribuzione delle card informative.", location: "Spazio di quartiere · Cagliari", startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), channels: ["Social", "Telegram"] },
];

export class PropagandaError extends Error { constructor(message: string, public status = 400, public code = "ERROR") { super(message); } }
