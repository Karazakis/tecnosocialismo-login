import { NextResponse } from "next/server";
import { propagandaAction, requirePropaganda } from "@/lib/propaganda";
import { propagandaApiError } from "@/lib/propaganda-response";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { const actor = await requirePropaganda(request); const input = await request.json() as Record<string, unknown>; return NextResponse.json(await propagandaAction(actor, input)); }
  catch (error) { return propagandaApiError(error, "Operazione non riuscita."); }
}
