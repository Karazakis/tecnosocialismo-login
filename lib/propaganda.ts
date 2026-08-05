import { ensurePropagandaSchema, pool } from "@/db";
import { audit, requireMilitant, type MilitantActor, type MilitantRole } from "@/lib/militant";
import { awardMilitantPoints, propagandaStage, type MilitantClassId } from "@/lib/militant-progression";

const roleRank: Record<MilitantRole, number> = { observer: 0, contributor: 1, coordinator: 2, admin: 3, owner: 4 };
const contentStatuses = ["draft", "review", "approved", "scheduled", "published", "archived"] as const;
const eventStatuses = ["draft", "approved", "published", "completed", "cancelled"] as const;
const channelStatuses = ["draft", "connected", "paused"] as const;
const formats = ["card", "post", "thread", "video", "message"] as const;
const contentTypes = ["political", "editorial", "community"] as const;
const activityKinds = ["share", "event", "outreach", "report", "production"] as const;
const pointValues: Record<(typeof activityKinds)[number], number> = { share: 3, event: 20, outreach: 8, report: 5, production: 12 };
const activityClasses: Record<(typeof activityKinds)[number], MilitantClassId> = { share: "comunicatore", event: "organizzatore", outreach: "organizzatore", report: "ricercatore", production: "comunicatore" };
const guidedTemplates = [
  { id: "tempo-liberato", title: "La tecnologia deve liberare tempo", body: "Automazione e capacità scientifica possono ridurre il lavoro necessario e ampliare ciò che scegliamo di fare insieme.", callToAction: "Scopri il progetto", contentType: "political" as const },
  { id: "bisogni-reali", title: "Organizzare i bisogni reali", body: "Un dato utile non sorveglia le persone: aiuta una comunità a capire cosa manca e come costruirlo.", callToAction: "Leggi il manifesto", contentType: "editorial" as const },
  { id: "rete-usabile", title: "Una rete cresce quando può essere usata", body: "Portali aperti, strumenti comuni, formazione accessibile e organizzazione territoriale rendono concreta la partecipazione.", callToAction: "Esplora i portali", contentType: "community" as const },
  { id: "valore-sociale", title: "Il valore parte dai bisogni", body: "Misurare ciò che serve, ciò che possiamo fare e il tempo disponibile permette decisioni più trasparenti del solo prezzo di mercato.", callToAction: "Approfondisci", contentType: "political" as const },
];

export type PropagandaActor = MilitantActor & { propagandaPermissions: string[]; propagandaProfile: ReturnType<typeof propagandaStage> };

export async function requirePropaganda(request: Request, minimum: MilitantRole = "observer"): Promise<PropagandaActor> {
  await ensurePropagandaSchema();
  const actor = await requireMilitant(request, minimum);
  if (actor.level < 1) throw new PropagandaError("Completa il livello 1 su Militant per accedere alla cabina.", 403, "LEVEL_REQUIRED");
  return { ...actor, propagandaPermissions: permissionsFor(actor.role, actor.level), propagandaProfile: propagandaStage(actor.level) };
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
    progression: actor.propagandaProfile,
    guidedTemplates,
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
    requireProgressLevel(actor, 5, "La regia di campagna si sblocca al livello 5.");
    const title = required(input.title, 180, "Inserisci il nome della campagna.");
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO propaganda_campaigns(id,title,objective,audience,status,created_by) VALUES($1,$2,$3,$4,$5,$6)", [id, title, text(input.objective, 4000), text(input.audience, 800), oneOf(input.status, ["draft", "active", "paused", "completed"] as const, "draft"), actor.id]);
    await audit(actor, "propaganda.campaign_created", "propaganda_campaign", id, { title });
    return { message: "Campagna creata.", id };
  }
  if (action === "create-content") {
    requireRole(actor, "contributor");
    requireProgressLevel(actor, 2, "Al livello 1 puoi condividere i contenuti approvati; la creazione assistita si sblocca al livello 2.");
    const template = guidedTemplates.find((item) => item.id === text(input.templateId, 80));
    if (actor.level < 4 && !template) throw new PropagandaError("Seleziona un modello approvato per creare il contenuto.", 400, "TEMPLATE_REQUIRED");
    const guided = actor.level < 4;
    const title = guided ? template!.title : required(input.title, 180, "Inserisci il titolo del contenuto.");
    const body = guided ? template!.body : text(input.body, 12000);
    const contentType = guided ? template!.contentType : oneOf(input.contentType, contentTypes, "political");
    const availableFormats = actor.level === 2 ? (["card", "post"] as const) : actor.level === 3 ? (["card", "post", "thread"] as const) : formats;
    const format = oneOf(input.format, availableFormats, "post");
    const channelLimit = actor.level === 2 ? 1 : actor.level === 3 ? 3 : 12;
    const channels = list(input.channels, channelLimit);
    const callToAction = actor.level >= 3 ? text(input.callToAction, 500) || template?.callToAction || "" : template?.callToAction || "";
    const status = actor.level >= 4 ? oneOf(input.status, contentStatuses, "draft") : "review";
    const scheduledAt = actor.level >= 4 ? dateOrNull(input.scheduledAt) : null;
    const disclosure = contentType === "political" ? true : Boolean(input.politicalDisclosure);
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO propaganda_content(id,campaign_id,format,content_type,title,body,call_to_action,political_disclosure,status,channels,scheduled_at,author_id,author_name)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, actor.level >= 5 ? uuidOrNull(input.campaignId) : null, format, contentType, title, body, callToAction, disclosure, status, channels, scheduledAt, actor.id, actor.name]);
    await audit(actor, "propaganda.content_created", "propaganda_content", id, { title, contentType, level: actor.level, guided });
    return { message: "Contenuto aggiunto alla scaletta.", id };
  }
  if (action === "update-content") {
    requireRole(actor, "coordinator");
    requireProgressLevel(actor, 4, "Revisione e programmazione si sbloccano al livello 4.");
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
    requireProgressLevel(actor, 5, "La gestione dei publisher si sblocca al livello 5.");
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
    requireProgressLevel(actor, 5, "La gestione dei publisher si sblocca al livello 5.");
    const id = uuid(input.id);
    await pool.query("UPDATE propaganda_channels SET status=$2,cadence=COALESCE(NULLIF($3,''),cadence),auto_generation=$4,editorial_mix=$5,updated_at=now() WHERE id=$1", [id, oneOf(input.status, channelStatuses, "paused"), text(input.cadence, 300), Boolean(input.autoGeneration), JSON.stringify(normalizeMix(input.editorialMix))]);
    await audit(actor, "propaganda.channel_updated", "propaganda_channel", id, {});
    return { message: "Publisher aggiornato." };
  }
  if (action === "create-event") {
    requireRole(actor, "contributor");
    requireProgressLevel(actor, 3, "Gli eventi collegati si sbloccano con le real-life quest al livello 3.");
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
    requireProgressLevel(actor, 4, "La gestione editoriale degli eventi si sblocca al livello 4.");
    const id = uuid(input.id);
    const status = oneOf(input.status, eventStatuses, "draft");
    await pool.query("UPDATE propaganda_events SET status=$2,channels=CASE WHEN cardinality($3::text[])>0 THEN $3 ELSE channels END,updated_at=now() WHERE id=$1", [id, status, list(input.channels, 12)]);
    await audit(actor, "propaganda.event_updated", "propaganda_event", id, { status });
    return { message: "Evento aggiornato." };
  }
  if (action === "record-metrics") {
    requireRole(actor, "coordinator");
    requireProgressLevel(actor, 3, "L’analisi avanzata si sblocca al livello 3.");
    const id = uuid(input.id);
    const metrics = { impressions: integer(input.impressions), interactions: integer(input.interactions), shares: integer(input.shares), clicks: integer(input.clicks) };
    await pool.query("UPDATE propaganda_content SET metrics=$2,updated_at=now() WHERE id=$1", [id, JSON.stringify(metrics)]);
    await audit(actor, "propaganda.metrics_recorded", "propaganda_content", id, metrics);
    return { message: "Metriche registrate." };
  }
  if (action === "log-activity") {
    requireRole(actor, "contributor");
    requireProgressLevel(actor, 1, "Completa il livello 1 su Militant.");
    const kind = oneOf(input.kind, activityKinds, "share");
    const title = required(input.title, 220, "Descrivi l’attività svolta.");
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO propaganda_activity(id,actor_id,actor_name,kind,title,evidence,points) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, actor.id, actor.name, kind, title, text(input.evidence, 2000), pointValues[kind]]);
    await audit(actor, "propaganda.activity_submitted", "propaganda_activity", id, { kind, points: pointValues[kind] });
    return { message: "Attività inviata alla verifica.", id };
  }
  if (action === "verify-activity") {
    requireRole(actor, "coordinator");
    requireProgressLevel(actor, 3, "La verifica delle attività si sblocca al livello 3.");
    const id = uuid(input.id);
    const status = input.approved === false ? "rejected" : "verified";
    const row = (await pool.query("SELECT actor_id,points,status,kind FROM propaganda_activity WHERE id=$1", [id])).rows[0] as { actor_id: string; points: number; status: string; kind: (typeof activityKinds)[number] } | undefined;
    if (!row) throw new PropagandaError("Attività non trovata.", 404);
    if (row.status !== "pending") throw new PropagandaError("Questa attività è già stata verificata.", 409);
    if (status === "verified") await awardMilitantPoints(row.actor_id, "propaganda", id, activityClasses[row.kind] ?? "comunicatore", Number(row.points), { kind: row.kind });
    await pool.query("UPDATE propaganda_activity SET status=$2,verified_by=$3,verified_at=now() WHERE id=$1", [id, status, actor.id]);
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

function permissionsFor(role: MilitantRole, level: number) {
  const permissions = ["public:view", "analytics:view", "library:share"];
  if (role !== "observer" && level >= 1) permissions.push("activity:submit");
  if (role !== "observer" && level >= 2) permissions.push("content:create-guided");
  if (role !== "observer" && level >= 3) permissions.push("events:create", "content:contextualize");
  if (role !== "observer" && level >= 4) permissions.push("content:create", "schedule:propose");
  if (roleRank[role] >= roleRank.coordinator && level >= 3) permissions.push("activity:verify");
  if (roleRank[role] >= roleRank.coordinator && level >= 4) permissions.push("content:review", "schedule:manage");
  if (roleRank[role] >= roleRank.coordinator && level >= 5) permissions.push("publishers:manage", "campaigns:manage");
  if (roleRank[role] >= roleRank.admin && level >= 5) permissions.push("settings:manage");
  return permissions;
}

function requireRole(actor: PropagandaActor, minimum: MilitantRole) { if (roleRank[actor.role] < roleRank[minimum]) throw new PropagandaError("Non hai il livello di permesso necessario.", 403); }
function requireProgressLevel(actor: PropagandaActor, level: number, message: string) { if (actor.level < level) throw new PropagandaError(message, 403, "LEVEL_REQUIRED"); }
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
