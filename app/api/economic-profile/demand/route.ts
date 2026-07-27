import { listEconomicProfiles, type EconomicPreference, type PreferenceCadence } from "@/lib/economic-profile";

export const dynamic = "force-dynamic";

type Demand = {
  key: string;
  category: string;
  item: string;
  people: number;
  totalQuantity: number;
  unit: string;
  cadence: PreferenceCadence;
  essentialCount: number;
};

export async function GET() {
  const profiles = await listEconomicProfiles();
  const map = new Map<string, Demand>();
  for (const profile of profiles) {
    const counted = new Set<string>();
    for (const preference of profile.basket) {
      if (!preference.enabled || preference.domain !== "goods") continue;
      const normalized = normalize(preference.item);
      const key = `${preference.category}|${normalized}|${preference.unit}|${preference.cadence}`;
      const current = map.get(key) ?? demandFrom(preference, key);
      if (!counted.has(key)) {
        current.people += 1;
        counted.add(key);
      }
      current.totalQuantity += preference.quantity;
      if (preference.priority === "essenziale") current.essentialCount += 1;
      map.set(key, current);
    }
  }
  return Response.json({ demand: [...map.values()].sort((a, b) => b.essentialCount - a.essentialCount || b.people - a.people) }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
}

function demandFrom(preference: EconomicPreference, key: string): Demand {
  return { key, category: preference.category, item: preference.item, people: 0, totalQuantity: 0, unit: preference.unit, cadence: preference.cadence, essentialCount: 0 };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
