import { NextResponse } from "next/server";
import { createFeedback, listFeedback, requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireMilitant(request); return NextResponse.json({ feedback: await listFeedback() }); }
  catch (error) { return militantApiError(error, "Segnalazioni non disponibili."); }
}
export async function POST(request: Request) {
  try { const actor = await requireMilitant(request, "contributor"); const body = await request.json().catch(() => ({})); return NextResponse.json({ feedback: await createFeedback(actor, body) }, { status: 201 }); }
  catch (error) { return militantApiError(error, "Segnalazione non creata."); }
}
