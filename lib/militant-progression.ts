import { ensureMilitantSchema, pool } from "@/db";
import { audit, MilitantError, type MilitantActor, type MilitantRole } from "@/lib/militant";

export type MilitantClassId = "comunicatore" | "organizzatore" | "mutualista" | "formatore" | "costruttore" | "ricercatore";
export type ProgressSource = "training" | "propaganda" | "quest" | "task" | "community";

type TrainingDefinition = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  track: "fondamenti" | "organizzazione" | "strumenti";
  requiredLevel: number;
  points: number;
  duration: number;
  classId: MilitantClassId;
  portal: { label: string; url: string };
  lessons: string[];
  quiz: { question: string; options: string[]; answer: number };
};

type QuestDefinition = {
  id: string;
  type: "culturale" | "politica" | "mutualismo";
  title: string;
  description: string;
  objective: string;
  requiredLevel: number;
  points: number;
  classId: MilitantClassId;
  duration: string;
  location: string;
  portals: { label: string; url: string }[];
};

export const LEVEL_THRESHOLDS = [0, 100, 300, 650, 1_100, 1_800, 2_800, 4_200, 6_000, 8_500, 12_000] as const;
const CLASS_THRESHOLDS = [0, 40, 140, 320, 650, 1_100] as const;
const roleRank: Record<MilitantRole, number> = { observer: 0, contributor: 1, coordinator: 2, admin: 3, owner: 4 };

const classDefinitions: { id: MilitantClassId; name: string; mark: string; description: string; portals: string[]; abilities: string[] }[] = [
  { id: "comunicatore", name: "Comunicatore", mark: "CO", description: "Traduce idee complesse in contenuti chiari, verificabili e condivisibili.", portals: ["Propaganda", "Social", "Video", "Musica"], abilities: ["Narrazione", "Produzione", "Diffusione", "Analisi risposta"] },
  { id: "organizzatore", name: "Organizzatore", mark: "OR", description: "Coordina persone, appuntamenti e responsabilità tra rete e territorio.", portals: ["Militant", "Social", "Messaggi", "Burocrazia"], abilities: ["Accoglienza", "Logistica", "Facilitazione", "Coordinamento"] },
  { id: "mutualista", name: "Mutualista", mark: "MU", description: "Costruisce risposte concrete ai bisogni attraverso reti di sostegno reciproco.", portals: ["Servizi", "Salute", "Market", "Sport"], abilities: ["Ascolto", "Cura", "Distribuzione", "Rete territoriale"] },
  { id: "formatore", name: "Formatore", mark: "FO", description: "Crea percorsi di apprendimento e accompagna altre persone nella crescita.", portals: ["Educazione", "Biblioteca", "Iskra", "Video"], abilities: ["Studio", "Tutoraggio", "Laboratori", "Curriculum"] },
  { id: "costruttore", name: "Costruttore", mark: "CT", description: "Progetta strumenti, infrastrutture e processi digitali utili alla comunità.", portals: ["Cloud", "Rizoma", "Azienda", "Lavoro"], abilities: ["Prototipazione", "Dati", "Automazione", "Infrastruttura"] },
  { id: "ricercatore", name: "Ricercatore", mark: "RI", description: "Raccoglie fonti, verifica ipotesi e trasforma l’esperienza in conoscenza comune.", portals: ["Rizoma", "Biblioteca", "Legge", "Iskra"], abilities: ["Fonti", "Inchiesta", "Valutazione", "Documentazione"] },
];

const trainingModules: TrainingDefinition[] = [
  {
    id: "fondamenti-bisogni", title: "Bisogni, libertà e valore sociale", subtitle: "Fondamenti · 1 di 4",
    description: "Distingui bisogno, preferenza e valore di mercato per leggere le scelte collettive senza cancellare l’autonomia individuale.",
    track: "fondamenti", requiredLevel: 0, points: 25, duration: 12, classId: "ricercatore", portal: { label: "Biblioteca", url: "https://biblioteca.tecnosocialismo.com" },
    lessons: ["Il bisogno non è un ordine imposto: è una condizione da rendere visibile e discutibile.", "Il valore sociale considera utilità, scarsità, tempo e possibilità reali di contribuire.", "Le decisioni collettive devono restare verificabili, contestabili e modificabili."],
    quiz: { question: "Quale principio rende legittima una valutazione sociale?", options: ["Che sia segreta", "Che sia verificabile e modificabile", "Che coincida sempre col prezzo", "Che decida una sola persona"], answer: 1 },
  },
  {
    id: "fondamenti-democrazia", title: "Decisione, delega e controllo", subtitle: "Fondamenti · 2 di 4",
    description: "Comprendi la differenza tra partecipazione diretta, delega revocabile e amministrazione tecnica.",
    track: "fondamenti", requiredLevel: 0, points: 25, duration: 14, classId: "organizzatore", portal: { label: "Social", url: "https://social.tecnosocialismo.com" },
    lessons: ["Una delega serve a coordinare, non a cedere definitivamente il potere.", "Mandato, durata e criteri di verifica devono essere espliciti.", "Le minoranze devono poter documentare dissenso e proporre revisioni."],
    quiz: { question: "Quando una delega resta democratica?", options: ["Quando è irrevocabile", "Quando non ha scadenza", "Quando mandato e controllo sono espliciti", "Quando non lascia tracce"], answer: 2 },
  },
  {
    id: "fondamenti-tecnologia", title: "Tecnologia come infrastruttura comune", subtitle: "Fondamenti · 3 di 4",
    description: "Valuta una tecnologia per il tempo che libera, il potere che distribuisce e i rischi che rende controllabili.",
    track: "fondamenti", requiredLevel: 0, points: 25, duration: 13, classId: "costruttore", portal: { label: "Iskra", url: "https://iskra.tecnosocialismo.com" },
    lessons: ["L’automazione è utile quando riduce lavoro necessario senza concentrare il controllo.", "Dati minimi, interoperabilità e auditabilità riducono la dipendenza.", "Ogni sistema deve prevedere sicurezza, manutenzione e possibilità di uscita."],
    quiz: { question: "Quale criterio indica una tecnologia emancipatrice?", options: ["Concentra il controllo", "Rende gli utenti dipendenti", "Riduce il lavoro necessario e distribuisce capacità", "Nasconde il funzionamento"], answer: 2 },
  },
  {
    id: "fondamenti-pratica", title: "Etica della pratica politica", subtitle: "Fondamenti · 4 di 4",
    description: "Impara le regole minime per comunicare, organizzare e agire senza manipolazione, discriminazione o esposizione inutile.",
    track: "fondamenti", requiredLevel: 0, points: 25, duration: 15, classId: "comunicatore", portal: { label: "Propaganda", url: "https://propaganda.tecnosocialismo.com" },
    lessons: ["L’origine politica dei contenuti deve essere riconoscibile.", "Consenso, privacy e sicurezza vengono prima delle metriche.", "Un errore documentato e corretto rafforza la fiducia più di una certezza simulata."],
    quiz: { question: "Come va presentato un contenuto politico del progetto?", options: ["Con origine riconoscibile", "Come opinione neutrale inventata", "Senza possibilità di verifica", "Usando dati personali"], answer: 0 },
  },
  {
    id: "organizzazione-ascolto", title: "Ascolto e mappatura dei bisogni", subtitle: "Organizzazione",
    description: "Trasforma osservazioni e richieste in una mappa utilizzabile senza ridurre le persone a profili.",
    track: "organizzazione", requiredLevel: 1, points: 45, duration: 18, classId: "mutualista", portal: { label: "Servizi", url: "https://servizi.tecnosocialismo.com" },
    lessons: ["Separare urgenza, frequenza e impatto aiuta a evitare graduatorie arbitrarie.", "La raccolta dati deve avere uno scopo dichiarato e una durata limitata.", "Chi esprime un bisogno deve poter correggere la sua rappresentazione."],
    quiz: { question: "Qual è il primo vincolo nella raccolta di un bisogno?", options: ["Raccogliere ogni dato possibile", "Definire scopo e dati minimi", "Pubblicare subito il nome", "Trasformarlo in pubblicità"], answer: 1 },
  },
  {
    id: "organizzazione-facilitazione", title: "Facilitare un gruppo", subtitle: "Organizzazione",
    description: "Prepara riunioni leggibili, distribuisci la parola e chiudi ogni incontro con responsabilità verificabili.",
    track: "organizzazione", requiredLevel: 1, points: 45, duration: 20, classId: "organizzatore", portal: { label: "Messaggi", url: "https://messaggi.tecnosocialismo.com" },
    lessons: ["Un ordine del giorno distingue informazione, confronto e decisione.", "La facilitazione protegge la partecipazione, non il risultato preferito.", "Ogni decisione deve indicare responsabile, scadenza e criterio di completamento."],
    quiz: { question: "Cosa rende operativa una decisione?", options: ["Un titolo generico", "Responsabile, scadenza e criterio", "Molti messaggi", "Nessuna verifica"], answer: 1 },
  },
  {
    id: "strumenti-fonti", title: "Fonti, verifica e contesto", subtitle: "Strumenti",
    description: "Controlla provenienza, data e limiti di un’informazione prima di trasformarla in materiale pubblico.",
    track: "strumenti", requiredLevel: 2, points: 70, duration: 22, classId: "ricercatore", portal: { label: "Rizoma", url: "https://rizoma.tecnosocialismo.com" },
    lessons: ["Una fonte primaria documenta il fatto, una secondaria lo interpreta.", "Data e contesto possono cambiare completamente il significato di un dato.", "Quando l’incertezza resta, va comunicata."],
    quiz: { question: "Se una verifica non elimina l’incertezza, cosa si fa?", options: ["La si nasconde", "Si inventa una conclusione", "La si comunica chiaramente", "Si elimina la fonte"], answer: 2 },
  },
  {
    id: "strumenti-sicurezza-eventi", title: "Sicurezza e cura negli eventi", subtitle: "Strumenti",
    description: "Progetta accessibilità, gestione dei rischi e canali di supporto prima di un’attività nel territorio.",
    track: "strumenti", requiredLevel: 2, points: 70, duration: 24, classId: "organizzatore", portal: { label: "Burocrazia", url: "https://burocrazia.tecnosocialismo.com" },
    lessons: ["Luogo, accessibilità, permessi e contatti di emergenza fanno parte dell’attività politica.", "Ruoli di cura e de-escalation devono essere assegnati prima dell’evento.", "Il resoconto finale registra problemi e miglioramenti senza esporre partecipanti."],
    quiz: { question: "Quando si definiscono i ruoli di cura e de-escalation?", options: ["Dopo un problema", "Prima dell’evento", "Mai", "Solo sui social"], answer: 1 },
  },
  {
    id: "pratica-mutualismo", title: "Progettare un intervento mutualistico", subtitle: "Pratica avanzata",
    description: "Collega domanda, risorse, competenze e continuità per evitare interventi episodici o paternalistici.",
    track: "organizzazione", requiredLevel: 3, points: 90, duration: 28, classId: "mutualista", portal: { label: "Market", url: "https://market.tecnosocialismo.com" },
    lessons: ["Le persone coinvolte partecipano alla definizione dell’intervento.", "Risorse e criteri di accesso devono essere leggibili.", "La continuità si valuta insieme agli effetti inattesi."],
    quiz: { question: "Chi definisce un intervento mutualistico?", options: ["Solo chi lo finanzia", "Anche le persone direttamente coinvolte", "Un algoritmo segreto", "Nessuno"], answer: 1 },
  },
  {
    id: "pratica-documentazione", title: "Documentare e trasmettere capacità", subtitle: "Pratica avanzata",
    description: "Trasforma un’esperienza riuscita in una guida ripetibile, adattabile e criticabile da altri gruppi.",
    track: "strumenti", requiredLevel: 3, points: 90, duration: 26, classId: "formatore", portal: { label: "Educazione", url: "https://educazione.tecnosocialismo.com" },
    lessons: ["Una guida utile chiarisce prerequisiti, passaggi, rischi e criteri di verifica.", "Il contesto va separato dagli elementi trasferibili.", "Versioni e feedback rendono visibile l’evoluzione della pratica."],
    quiz: { question: "Cosa deve contenere una pratica trasferibile?", options: ["Solo il risultato", "Prerequisiti, passaggi, rischi e verifica", "Nomi privati", "Una promessa"], answer: 1 },
  },
];

const questDefinitions: QuestDefinition[] = [
  { id: "cultura-accoglienza", type: "culturale", title: "Accoglienza a un evento culturale", description: "Supporta accesso, orientamento e inclusione durante un incontro, concerto, proiezione o laboratorio.", objective: "Concorda un ruolo con l’organizzazione, svolgilo e registra un breve resoconto.", requiredLevel: 3, points: 120, classId: "organizzatore", duration: "2–4 ore", location: "Eventi pubblicati su Social", portals: [{ label: "Social", url: "https://social.tecnosocialismo.com" }, { label: "Musica", url: "https://musica.tecnosocialismo.com" }] },
  { id: "cultura-documentazione", type: "culturale", title: "Documenta e restituisci un evento", description: "Crea una restituzione accessibile con appunti, immagini autorizzate o una breve sintesi video.", objective: "Pubblica il materiale nel portale adatto e collega la fonte dell’evento.", requiredLevel: 3, points: 100, classId: "comunicatore", duration: "3 ore", location: "Biblioteca, Video o Social", portals: [{ label: "Video", url: "https://video.tecnosocialismo.com" }, { label: "Biblioteca", url: "https://biblioteca.tecnosocialismo.com" }] },
  { id: "politica-logistica", type: "politica", title: "Logistica per una manifestazione", description: "Partecipa a un’attività politica reale con un compito concordato di accoglienza, materiali o coordinamento.", objective: "Verifica permessi e indicazioni, svolgi il compito e segnala criticità utili.", requiredLevel: 4, points: 160, classId: "organizzatore", duration: "Mezza giornata", location: "Manifestazioni verificate", portals: [{ label: "Social", url: "https://social.tecnosocialismo.com" }, { label: "Burocrazia", url: "https://burocrazia.tecnosocialismo.com" }] },
  { id: "politica-comunicazione", type: "politica", title: "Racconto pubblico di una mobilitazione", description: "Produci una cronaca trasparente e contestualizzata usando solo materiali autorizzati.", objective: "Collega fonti, dichiarazione politica e invito all’azione verificabile.", requiredLevel: 4, points: 150, classId: "comunicatore", duration: "4 ore", location: "Propaganda + Video", portals: [{ label: "Propaganda", url: "https://propaganda.tecnosocialismo.com" }, { label: "Video", url: "https://video.tecnosocialismo.com" }] },
  { id: "mutualismo-distribuzione", type: "mutualismo", title: "Supporta una distribuzione mutualistica", description: "Collabora alla raccolta, organizzazione o consegna di beni richiesti nel rispetto di criteri pubblici.", objective: "Registra il contributo senza dati personali dei beneficiari e segnala bisogni non coperti.", requiredLevel: 5, points: 220, classId: "mutualista", duration: "Mezza giornata", location: "Reti locali verificate", portals: [{ label: "Market", url: "https://market.tecnosocialismo.com" }, { label: "Servizi", url: "https://servizi.tecnosocialismo.com" }] },
  { id: "mutualismo-accesso-digitale", type: "mutualismo", title: "Sportello di accesso digitale", description: "Aiuta una persona a usare un servizio digitale, compilare una pratica o proteggere il proprio account.", objective: "Opera con consenso, non conservare credenziali e documenta soltanto il tipo di supporto.", requiredLevel: 5, points: 200, classId: "costruttore", duration: "2 ore", location: "Luogo o call concordata", portals: [{ label: "Burocrazia", url: "https://burocrazia.tecnosocialismo.com" }, { label: "Cloud", url: "https://cloud.tecnosocialismo.com" }] },
];

export async function getMilitantProgression(actor: MilitantActor) {
  await ensureMilitantSchema();
  const [memberResult, trainingResult, xpResult, questResult, pendingResult] = await Promise.all([
    pool.query<{ level: number; points: number }>("SELECT level,points FROM militant_members WHERE user_id=$1", [actor.id]),
    pool.query<{ module_id: string; status: "available" | "completed"; attempts: number; score: number; completed_at: Date | string | null }>("SELECT module_id,status,attempts,score,completed_at FROM militant_training_progress WHERE user_id=$1", [actor.id]),
    pool.query<{ class_id: MilitantClassId; xp: string }>("SELECT class_id,sum(points)::text xp FROM militant_xp_events WHERE user_id=$1 GROUP BY class_id", [actor.id]),
    pool.query<{ quest_id: string; status: "joined" | "submitted" | "verified" | "rejected"; evidence: string; points_awarded: number; joined_at: Date | string; submitted_at: Date | string | null; verified_at: Date | string | null }>("SELECT quest_id,status,evidence,points_awarded,joined_at,submitted_at,verified_at FROM militant_quest_progress WHERE user_id=$1", [actor.id]),
    roleRank[actor.role] >= roleRank.coordinator
      ? pool.query<{ user_id: string; name: string | null; email: string; quest_id: string; evidence: string; submitted_at: Date | string }>(`SELECT p.user_id,u.name,u.email,p.quest_id,p.evidence,p.submitted_at FROM militant_quest_progress p JOIN "user" u ON u.id=p.user_id WHERE p.status='submitted' ORDER BY p.submitted_at LIMIT 100`)
      : Promise.resolve({ rows: [] }),
  ]);
  const level = Number(memberResult.rows[0]?.level ?? actor.level ?? 0);
  const points = Number(memberResult.rows[0]?.points ?? actor.points ?? 0);
  const completed = new Map(trainingResult.rows.map((item) => [item.module_id, item]));
  const questProgress = new Map(questResult.rows.map((item) => [item.quest_id, item]));
  const classXp = new Map(xpResult.rows.map((item) => [item.class_id, Number(item.xp)]));
  const nextThreshold = LEVEL_THRESHOLDS[level + 1] ?? null;
  const currentThreshold = LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] ?? 0;
  const coreIds = trainingModules.filter((item) => item.requiredLevel === 0).map((item) => item.id);
  const coreCompleted = coreIds.filter((id) => completed.get(id)?.status === "completed").length;
  const propaganda = propagandaStage(level);

  return {
    actor: { ...actor, level, points },
    level: {
      current: level,
      points,
      currentThreshold,
      nextThreshold,
      remaining: nextThreshold === null ? 0 : Math.max(0, nextThreshold - points),
      progress: nextThreshold === null ? 100 : Math.max(0, Math.min(100, Math.round(((points - currentThreshold) / Math.max(1, nextThreshold - currentThreshold)) * 100))),
      title: levelTitle(level),
    },
    unlocks: unlockDefinitions.map((item) => ({ ...item, state: level >= item.level ? "unlocked" : item.level === level + 1 ? "next" : "locked" })),
    training: {
      coreCompleted,
      coreTotal: coreIds.length,
      completed: trainingResult.rows.filter((item) => item.status === "completed").length,
      total: trainingModules.length,
      modules: trainingModules.map((item) => {
        const progress = completed.get(item.id);
        return {
          id: item.id, title: item.title, subtitle: item.subtitle, description: item.description, track: item.track,
          requiredLevel: item.requiredLevel, points: item.points, duration: item.duration, classId: item.classId, portal: item.portal,
          lessons: item.lessons, quiz: { question: item.quiz.question, options: item.quiz.options }, attempts: progress?.attempts ?? 0,
          completedAt: progress?.completed_at ? iso(progress.completed_at) : null,
          status: progress?.status === "completed" ? "completed" : item.requiredLevel > level ? "locked" : "available",
        };
      }),
    },
    propaganda,
    classes: classDefinitions.map((item) => {
      const xp = classXp.get(item.id) ?? 0;
      const classLevel = classLevelForXp(xp);
      const next = CLASS_THRESHOLDS[classLevel + 1] ?? null;
      const base = CLASS_THRESHOLDS[classLevel] ?? 0;
      return { ...item, xp, level: classLevel, nextXp: next, remaining: next === null ? 0 : next - xp, progress: next === null ? 100 : Math.round(((xp - base) / Math.max(1, next - base)) * 100) };
    }),
    quests: questDefinitions.map((item) => {
      const progress = questProgress.get(item.id);
      return { ...item, state: progress?.status ?? (level >= item.requiredLevel ? "available" : "locked"), evidence: progress?.evidence ?? "", joinedAt: progress ? iso(progress.joined_at) : null, submittedAt: progress?.submitted_at ? iso(progress.submitted_at) : null, verifiedAt: progress?.verified_at ? iso(progress.verified_at) : null };
    }),
    pendingSubmissions: pendingResult.rows.map((item) => {
      const quest = questDefinitions.find((entry) => entry.id === item.quest_id);
      return { userId: item.user_id, userName: item.name || item.email.split("@")[0], questId: item.quest_id, questTitle: quest?.title ?? item.quest_id, evidence: item.evidence, submittedAt: iso(item.submitted_at) };
    }),
    integrations: [
      { id: "education", label: "Formazione", description: "Percorsi, guide e tutoraggio", url: "https://educazione.tecnosocialismo.com", mark: "ED" },
      { id: "propaganda", label: "Propaganda", description: propaganda.description, url: "https://propaganda.tecnosocialismo.com", mark: "PR" },
      { id: "social", label: "Eventi", description: level >= 3 ? "Missioni collegate agli eventi reali" : "Si sblocca al livello 3", url: "https://social.tecnosocialismo.com", mark: "SO" },
      { id: "messaggi", label: "Squadre", description: "Coordinamento e aggiornamenti", url: "https://messaggi.tecnosocialismo.com", mark: "ME" },
      { id: "market", label: "Mutualismo", description: level >= 5 ? "Interventi e distribuzione" : "Si sblocca al livello 5", url: "https://market.tecnosocialismo.com", mark: "MK" },
      { id: "burocrazia", label: "Permessi", description: "Pratiche e sicurezza degli eventi", url: "https://burocrazia.tecnosocialismo.com", mark: "BU" },
    ],
  };
}

export async function completeTraining(actor: MilitantActor, input: Record<string, unknown>) {
  await ensureMilitantSchema();
  const moduleId = safeText(input.moduleId, 100);
  const trainingModule = trainingModules.find((item) => item.id === moduleId);
  if (!trainingModule) throw new MilitantError("Modulo di formazione non trovato.", 404, "MODULE_NOT_FOUND");
  if (actor.level < trainingModule.requiredLevel) throw new MilitantError(`Questo modulo richiede il livello ${trainingModule.requiredLevel}.`, 403, "LEVEL_REQUIRED");
  const existing = await pool.query<{ status: string }>("SELECT status FROM militant_training_progress WHERE user_id=$1 AND module_id=$2", [actor.id, trainingModule.id]);
  if (existing.rows[0]?.status === "completed") return getMilitantProgression(actor);
  const answer = Number(input.answer);
  if (!Number.isInteger(answer) || answer !== trainingModule.quiz.answer) {
    await pool.query(`INSERT INTO militant_training_progress(user_id,module_id,attempts,score) VALUES($1,$2,1,0) ON CONFLICT(user_id,module_id) DO UPDATE SET attempts=militant_training_progress.attempts+1,score=0,updated_at=now()`, [actor.id, trainingModule.id]);
    throw new MilitantError("La risposta non è corretta. Rileggi il modulo e riprova.", 400, "ANSWER_INCORRECT");
  }
  await awardMilitantPoints(actor.id, "training", trainingModule.id, trainingModule.classId, trainingModule.points, { module: trainingModule.title });
  await pool.query(`INSERT INTO militant_training_progress(user_id,module_id,status,attempts,score,completed_at) VALUES($1,$2,'completed',1,100,now()) ON CONFLICT(user_id,module_id) DO UPDATE SET status='completed',attempts=militant_training_progress.attempts+1,score=100,completed_at=COALESCE(militant_training_progress.completed_at,now()),updated_at=now()`, [actor.id, trainingModule.id]);
  await audit(actor, "training.completed", "training_module", trainingModule.id, { points: trainingModule.points, classId: trainingModule.classId });
  return getMilitantProgression(actor);
}

export async function questProgressAction(actor: MilitantActor, questIdValue: string, input: Record<string, unknown>) {
  await ensureMilitantSchema();
  const questId = safeText(questIdValue, 100);
  const quest = questDefinitions.find((item) => item.id === questId);
  if (!quest) throw new MilitantError("Missione non trovata.", 404, "QUEST_NOT_FOUND");
  const action = safeText(input.action, 40);
  if (action === "verify" || action === "reject") {
    if (roleRank[actor.role] < roleRank.coordinator) throw new MilitantError("Non hai il permesso di verificare le missioni.", 403, "FORBIDDEN");
    const userId = safeText(input.userId, 160);
    const progress = await pool.query<{ status: string }>("SELECT status FROM militant_quest_progress WHERE user_id=$1 AND quest_id=$2", [userId, quest.id]);
    if (progress.rows[0]?.status !== "submitted") throw new MilitantError("Questa missione non è in attesa di verifica.", 409, "INVALID_STATUS");
    if (action === "verify") {
      await awardMilitantPoints(userId, "quest", quest.id, quest.classId, quest.points, { quest: quest.title });
      await pool.query("UPDATE militant_quest_progress SET status='verified',points_awarded=$3,verified_by=$4,verified_at=now(),updated_at=now() WHERE user_id=$1 AND quest_id=$2", [userId, quest.id, quest.points, actor.id]);
      await audit(actor, "quest.verified", "quest", quest.id, { userId, points: quest.points, classId: quest.classId });
    } else {
      await pool.query("UPDATE militant_quest_progress SET status='rejected',verified_by=$3,verified_at=now(),updated_at=now() WHERE user_id=$1 AND quest_id=$2", [userId, quest.id, actor.id]);
      await audit(actor, "quest.rejected", "quest", quest.id, { userId });
    }
    return getMilitantProgression(actor);
  }
  if (actor.level < quest.requiredLevel) throw new MilitantError(`Le missioni ${quest.type} si sbloccano al livello ${quest.requiredLevel}.`, 403, "LEVEL_REQUIRED");
  if (action === "join") {
    await pool.query(`INSERT INTO militant_quest_progress(user_id,quest_id,status) VALUES($1,$2,'joined') ON CONFLICT(user_id,quest_id) DO UPDATE SET status=CASE WHEN militant_quest_progress.status='rejected' THEN 'joined' ELSE militant_quest_progress.status END,updated_at=now()`, [actor.id, quest.id]);
    await audit(actor, "quest.joined", "quest", quest.id, { type: quest.type });
    return getMilitantProgression(actor);
  }
  if (action === "submit") {
    const evidence = safeText(input.evidence, 2500);
    if (!evidence) throw new MilitantError("Inserisci un breve resoconto o un riferimento verificabile.", 400, "EVIDENCE_REQUIRED");
    const updated = await pool.query("UPDATE militant_quest_progress SET status='submitted',evidence=$3,submitted_at=now(),updated_at=now() WHERE user_id=$1 AND quest_id=$2 AND status IN ('joined','rejected') RETURNING user_id", [actor.id, quest.id, evidence]);
    if (!updated.rowCount) throw new MilitantError("Prima aderisci alla missione, poi invia il resoconto.", 409, "JOIN_REQUIRED");
    await audit(actor, "quest.submitted", "quest", quest.id, { type: quest.type });
    return getMilitantProgression(actor);
  }
  throw new MilitantError("Azione sulla missione non riconosciuta.", 400, "INVALID_ACTION");
}

export async function awardMilitantPoints(userId: string, sourceType: ProgressSource, sourceId: string, classId: MilitantClassId, points: number, details: Record<string, unknown> = {}) {
  const safePoints = Math.max(1, Math.min(10_000, Math.round(points)));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const member = await client.query<{ points: number }>("SELECT points FROM militant_members WHERE user_id=$1 AND status='active' FOR UPDATE", [userId]);
    if (!member.rows[0]) throw new MilitantError("Membro attivo non trovato.", 404, "MEMBER_NOT_FOUND");
    const inserted = await client.query(`INSERT INTO militant_xp_events(id,user_id,source_type,source_id,class_id,points,details) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,source_type,source_id) DO NOTHING RETURNING points`, [crypto.randomUUID(), userId, sourceType, sourceId, classId, safePoints, JSON.stringify(details)]);
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return { awarded: false, points: Number(member.rows[0].points), level: levelForPoints(Number(member.rows[0].points)) };
    }
    const total = Number(member.rows[0].points) + safePoints;
    const level = levelForPoints(total);
    await client.query("UPDATE militant_members SET points=$2,level=$3,updated_at=now() WHERE user_id=$1", [userId, total, level]);
    await client.query("COMMIT");
    return { awarded: true, points: total, level };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function propagandaStage(level: number) {
  if (level < 1) return { level: 0, stage: "locked", label: "Da sbloccare", depth: 0, description: "Completa i quattro moduli fondamentali per accedere a Propaganda.", capabilities: [] as string[], nextLevel: 1 };
  if (level === 1) return { level: 1, stage: "guided", label: "Condivisione guidata", depth: 10, description: "Scegli e condividi soltanto contenuti già approvati, senza modificarli.", capabilities: ["Catalogo approvato", "Condivisione tracciata", "Punti dopo verifica"], nextLevel: 2 };
  if (level === 2) return { level: 2, stage: "assisted", label: "Scelta assistita", depth: 30, description: "Scegli modello, formato e un canale di pubblicazione.", capabilities: ["Modelli guidati", "Formato card o post", "Scelta del canale"], nextLevel: 3 };
  if (level === 3) return { level: 3, stage: "contextual", label: "Adattamento contestuale", depth: 55, description: "Adatta invito all’azione, formato e canali al contesto dell’attività.", capabilities: ["Invito all’azione", "Formati estesi", "Fino a tre canali", "Eventi collegati"], nextLevel: 4 };
  if (level === 4) return { level: 4, stage: "editorial", label: "Redazione autonoma", depth: 80, description: "Scrivi bozze originali, personalizza il testo e proponi la programmazione.", capabilities: ["Testo originale", "Programmazione", "Revisione editoriale", "Metriche contenuto"], nextLevel: 5 };
  return { level, stage: "strategy", label: "Regia di campagna", depth: 100, description: "Progetta campagne e, con il ruolo necessario, gestisci publisher e mix editoriale.", capabilities: ["Campagne", "Publisher autorizzati", "Mix editoriale", "Analisi avanzata"], nextLevel: null };
}

export function levelForPoints(points: number) {
  let level = 0;
  LEVEL_THRESHOLDS.forEach((threshold, index) => { if (points >= threshold) level = index; });
  return level;
}

function classLevelForXp(xp: number) {
  let level = 0;
  CLASS_THRESHOLDS.forEach((threshold, index) => { if (xp >= threshold) level = index; });
  return level;
}

const unlockDefinitions = [
  { level: 0, title: "Formazione politica", description: "Fondamenti, organizzazione e strumenti", mark: "FO", portals: ["Educazione", "Biblioteca", "Iskra"] },
  { level: 1, title: "Propaganda guidata", description: "Condividi contenuti approvati senza personalizzarli", mark: "PR", portals: ["Propaganda", "Social"] },
  { level: 2, title: "Propaganda assistita", description: "Scegli modelli, formati e canali", mark: "PA", portals: ["Propaganda", "Video", "Musica"] },
  { level: 3, title: "Missioni culturali", description: "Attività reali in eventi e spazi culturali", mark: "CU", portals: ["Social", "Musica", "Biblioteca"] },
  { level: 4, title: "Manifestazioni politiche", description: "Logistica e comunicazione in mobilitazioni verificate", mark: "MP", portals: ["Social", "Burocrazia", "Propaganda"] },
  { level: 5, title: "Interventi mutualistici", description: "Cura, distribuzione e accesso ai servizi", mark: "MU", portals: ["Market", "Servizi", "Salute"] },
];

function levelTitle(level: number) {
  return ["In formazione", "Militante", "Attivista digitale", "Presenza territoriale", "Organizzatore", "Mutualista", "Coordinatore", "Mentore", "Stratega", "Costruttore di rete", "Riferimento comune"][Math.min(level, 10)];
}

function safeText(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : ""; }
function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
