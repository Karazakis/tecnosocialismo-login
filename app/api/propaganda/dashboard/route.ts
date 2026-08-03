import { NextResponse } from "next/server";
import { propagandaDashboard, requirePropaganda } from "@/lib/propaganda";
import { propagandaApiError } from "@/lib/propaganda-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const actor = await requirePropaganda(request); return NextResponse.json(await propagandaDashboard(actor)); }
  catch (error) { return propagandaApiError(error, "Cabina non disponibile."); }
}
