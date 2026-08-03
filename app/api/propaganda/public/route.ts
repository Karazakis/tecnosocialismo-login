import { NextResponse } from "next/server";
import { publicPortal } from "@/lib/propaganda";
import { propagandaApiError } from "@/lib/propaganda-response";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await publicPortal()); }
  catch (error) { return propagandaApiError(error, "Dati pubblici non disponibili."); }
}
