import { NextResponse } from "next/server";
import { requirePropaganda } from "@/lib/propaganda";
import { propagandaApiError } from "@/lib/propaganda-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return NextResponse.json({ actor: await requirePropaganda(request) }); }
  catch (error) { return propagandaApiError(error, "Accesso non verificato."); }
}
