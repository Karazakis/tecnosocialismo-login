import { pool, ensureEconomicProfileSchema } from "@/db";

export type PreferenceDomain = "goods" | "services" | "work" | "leisure" | "education";
export type PreferenceCadence = "una-volta" | "settimanale" | "mensile" | "trimestrale" | "annuale";
export type PreferencePriority = "essenziale" | "importante" | "utile";

export type EconomicPreference = {
  id: string;
  domain: PreferenceDomain;
  category: string;
  item: string;
  quantity: number;
  unit: string;
  cadence: PreferenceCadence;
  priority: PreferencePriority;
  enabled: boolean;
  notes: string;
};

export type GeneralEconomicProfile = {
  version: 1;
  city: string;
  postalCode: string;
  householdSize: number;
  radiusKm: number;
  basket: EconomicPreference[];
  work: {
    desiredAreas: string[];
    skills: string[];
    preferredMode: "presenza" | "ibrido" | "remoto" | "indifferente";
    desiredHours: number;
    learningGoals: string[];
  };
  contribution: {
    areas: string[];
    hoursPerWeek: number;
    availability: string;
    mobility: "nessuna" | "piedi-bici" | "mezzo-leggero" | "auto-furgone";
    canDeliver: boolean;
    productiveActivities: string[];
    resources: string[];
  };
  updatedAt: string;
};

const defaultEntries: Omit<EconomicPreference, "id">[] = [
  { domain: "goods", category: "ortofrutta", item: "Verdura fresca di stagione", quantity: 4, unit: "kg", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "ortofrutta", item: "Frutta fresca di stagione", quantity: 3, unit: "kg", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "cereali-legumi", item: "Legumi secchi", quantity: 1, unit: "kg", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "cereali-legumi", item: "Pasta, riso e cereali", quantity: 2, unit: "kg", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "pane-forno", item: "Pane vegano", quantity: 2, unit: "pezzi", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "alternative-vegetali", item: "Tofu, seitan o tempeh", quantity: 2, unit: "confezioni", cadence: "settimanale", priority: "importante", enabled: true, notes: "" },
  { domain: "goods", category: "bevande-analcoliche", item: "Bevanda vegetale", quantity: 3, unit: "litri", cadence: "settimanale", priority: "importante", enabled: true, notes: "" },
  { domain: "goods", category: "caffe-te", item: "Caffè, tè o infusi", quantity: 1, unit: "confezioni", cadence: "mensile", priority: "utile", enabled: true, notes: "" },
  { domain: "goods", category: "casa-cucina", item: "Prodotti per la pulizia della casa", quantity: 2, unit: "confezioni", cadence: "mensile", priority: "importante", enabled: true, notes: "" },
  { domain: "goods", category: "igiene-cura", item: "Igiene personale vegana e cruelty-free", quantity: 2, unit: "confezioni", cadence: "mensile", priority: "essenziale", enabled: true, notes: "" },
  { domain: "goods", category: "abbigliamento", item: "Abbigliamento essenziale", quantity: 1, unit: "pezzi", cadence: "trimestrale", priority: "importante", enabled: true, notes: "" },
  { domain: "goods", category: "elettronica", item: "Dispositivi e accessori tecnologici", quantity: 1, unit: "pezzi", cadence: "annuale", priority: "utile", enabled: true, notes: "Preferenza per riparato o rigenerato" },
  { domain: "services", category: "salute", item: "Assistenza sanitaria di base", quantity: 2, unit: "ore", cadence: "annuale", priority: "essenziale", enabled: true, notes: "" },
  { domain: "services", category: "cura", item: "Servizi di cura e supporto", quantity: 2, unit: "ore", cadence: "mensile", priority: "importante", enabled: true, notes: "" },
  { domain: "services", category: "tecnica", item: "Riparazioni e manutenzione", quantity: 2, unit: "ore", cadence: "trimestrale", priority: "importante", enabled: true, notes: "" },
  { domain: "services", category: "mobilita", item: "Mobilità e trasporto locale", quantity: 4, unit: "ore", cadence: "mensile", priority: "importante", enabled: true, notes: "" },
  { domain: "services", category: "digitale", item: "Connettività e assistenza digitale", quantity: 2, unit: "ore", cadence: "mensile", priority: "essenziale", enabled: true, notes: "" },
  { domain: "work", category: "lavoro", item: "Attività lavorativa coerente con le mie competenze", quantity: 20, unit: "ore", cadence: "settimanale", priority: "essenziale", enabled: true, notes: "Da personalizzare" },
  { domain: "work", category: "formazione-lavoro", item: "Formazione e aggiornamento professionale", quantity: 4, unit: "ore", cadence: "mensile", priority: "importante", enabled: true, notes: "" },
  { domain: "leisure", category: "movimento", item: "Sport e movimento", quantity: 3, unit: "ore", cadence: "settimanale", priority: "importante", enabled: true, notes: "" },
  { domain: "leisure", category: "socialita", item: "Gioco, socialità e attività collettive", quantity: 2, unit: "ore", cadence: "settimanale", priority: "importante", enabled: true, notes: "" },
  { domain: "leisure", category: "cultura", item: "Cultura, musica e spettacolo", quantity: 4, unit: "ore", cadence: "mensile", priority: "utile", enabled: true, notes: "" },
  { domain: "education", category: "formazione", item: "Apprendimento continuo", quantity: 2, unit: "ore", cadence: "settimanale", priority: "importante", enabled: true, notes: "" },
  { domain: "education", category: "didattica", item: "Didattica tra pari", quantity: 2, unit: "ore", cadence: "mensile", priority: "utile", enabled: true, notes: "" },
];

export function createDefaultEconomicProfile(): GeneralEconomicProfile {
  return {
    version: 1,
    city: "",
    postalCode: "",
    householdSize: 1,
    radiusKm: 15,
    basket: defaultEntries.map((entry, index) => ({ ...entry, id: `default-${index + 1}` })),
    work: {
      desiredAreas: [],
      skills: [],
      preferredMode: "indifferente",
      desiredHours: 20,
      learningGoals: [],
    },
    contribution: {
      areas: [],
      hoursPerWeek: 0,
      availability: "",
      mobility: "nessuna",
      canDeliver: false,
      productiveActivities: [],
      resources: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function getEconomicProfile(userId: string): Promise<GeneralEconomicProfile | null> {
  await ensureEconomicProfileSchema();
  const result = await pool.query<{ profile: GeneralEconomicProfile }>(
    "SELECT profile FROM economic_profiles WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.profile ?? null;
}

export async function saveEconomicProfile(userId: string, profile: GeneralEconomicProfile) {
  await ensureEconomicProfileSchema();
  await pool.query(
    `INSERT INTO economic_profiles (user_id, profile, version, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (user_id) DO UPDATE
     SET profile = EXCLUDED.profile, version = EXCLUDED.version, updated_at = now()`,
    [userId, JSON.stringify(profile), profile.version],
  );
  return profile;
}

export async function listEconomicProfiles() {
  await ensureEconomicProfileSchema();
  const result = await pool.query<{ profile: GeneralEconomicProfile }>("SELECT profile FROM economic_profiles");
  return result.rows.map((row) => row.profile);
}

export function sanitizeEconomicProfile(value: unknown): GeneralEconomicProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const basket = Array.isArray(input.basket)
    ? input.basket.flatMap((raw, index) => sanitizePreference(raw, index)).slice(0, 120)
    : [];
  if (!basket.some((entry) => entry.enabled)) return null;
  const work = asRecord(input.work);
  const contribution = asRecord(input.contribution);
  const city = text(input.city, 80);
  const postalCode = text(input.postalCode, 12);
  if (!city || !postalCode) return null;
  return {
    version: 1,
    city,
    postalCode,
    householdSize: number(input.householdSize, 1, 20, 1),
    radiusKm: number(input.radiusKm, 1, 200, 15),
    basket,
    work: {
      desiredAreas: stringList(work.desiredAreas, 20),
      skills: stringList(work.skills, 30),
      preferredMode:
        work.preferredMode === "presenza" || work.preferredMode === "ibrido" || work.preferredMode === "remoto"
          ? work.preferredMode
          : "indifferente",
      desiredHours: number(work.desiredHours, 0, 80, 20),
      learningGoals: stringList(work.learningGoals, 20),
    },
    contribution: {
      areas: stringList(contribution.areas, 30),
      hoursPerWeek: number(contribution.hoursPerWeek, 0, 80, 0),
      availability: text(contribution.availability, 300),
      mobility:
        contribution.mobility === "piedi-bici" || contribution.mobility === "mezzo-leggero" || contribution.mobility === "auto-furgone"
          ? contribution.mobility
          : "nessuna",
      canDeliver: contribution.canDeliver === true,
      productiveActivities: stringList(contribution.productiveActivities, 30),
      resources: stringList(contribution.resources, 30),
    },
    updatedAt: new Date().toISOString(),
  };
}

function sanitizePreference(value: unknown, index: number): EconomicPreference[] {
  if (!value || typeof value !== "object") return [];
  const input = value as Record<string, unknown>;
  const domain = input.domain;
  if (domain !== "goods" && domain !== "services" && domain !== "work" && domain !== "leisure" && domain !== "education") return [];
  const item = text(input.item, 140);
  const category = text(input.category, 80);
  if (!item || !category) return [];
  const cadence = input.cadence;
  const priority = input.priority;
  return [{
    id: text(input.id, 80) || `preference-${index + 1}`,
    domain,
    category,
    item,
    quantity: number(input.quantity, 0.01, 100_000, 1),
    unit: text(input.unit, 30) || "pezzi",
    cadence: cadence === "una-volta" || cadence === "settimanale" || cadence === "trimestrale" || cadence === "annuale" ? cadence : "mensile",
    priority: priority === "essenziale" || priority === "utile" ? priority : "importante",
    enabled: input.enabled !== false,
    notes: text(input.notes, 320),
  }];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function stringList(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim().slice(0, 120)] : [])).slice(0, max)
    : [];
}
