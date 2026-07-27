import { auth } from "@/lib/auth";
import {
  createDefaultEconomicProfile,
  getEconomicProfile,
  sanitizeEconomicProfile,
  saveEconomicProfile,
} from "@/lib/economic-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return Response.json({ error: "Accesso richiesto." }, { status: 401 });
  const profile = await getEconomicProfile(session.user.id);
  return Response.json({ profile, defaults: profile ? undefined : createDefaultEconomicProfile() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return Response.json({ error: "Accesso richiesto." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const profile = sanitizeEconomicProfile(body);
  if (!profile) return Response.json({ error: "Completa territorio e almeno una preferenza attiva." }, { status: 400 });
  await saveEconomicProfile(session.user.id, profile);
  return Response.json({ profile });
}
