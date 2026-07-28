import { listEconomicProfiles, type EconomicPreference, type PreferenceCadence } from "@/lib/economic-profile";

export const dynamic = "force-dynamic";

type ServiceDemand = {
  key: string;
  category: string;
  item: string;
  people: number;
  totalHours: number;
  cadence: PreferenceCadence;
  essentialCount: number;
};

export async function GET() {
  const profiles = await listEconomicProfiles();
  const map = new Map<string, ServiceDemand>();
  for (const profile of profiles) {
    const counted = new Set<string>();
    for (const preference of profile.basket) {
      if (!preference.enabled || (preference.domain !== "services" && preference.domain !== "education")) continue;
      const category = portalCategory(preference);
      const key = `${category}|${normalize(preference.item)}|${preference.cadence}`;
      const current = map.get(key) ?? { key, category, item: preference.item, people: 0, totalHours: 0, cadence: preference.cadence, essentialCount: 0 };
      if (!counted.has(key)) { current.people += 1; counted.add(key); }
      current.totalHours += preference.unit === "ore" ? preference.quantity : 1;
      if (preference.priority === "essenziale") current.essentialCount += 1;
      map.set(key, current);
    }
  }
  return Response.json({ demand: [...map.values()].sort((a, b) => b.essentialCount - a.essentialCount || b.people - a.people) }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
}

function portalCategory(preference: EconomicPreference) {
  if (preference.domain === "education" || preference.category === "didattica" || preference.category === "formazione") return "didattica";
  if (preference.category === "salute") return "salute";
  if (preference.category === "cura") return "cura";
  return "tecnico";
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
