import { NextResponse } from "next/server";
import { requireMilitant, updateFeedback } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireMilitant(request, "coordinator"); const { id } = await context.params; const body = await request.json().catch(() => ({})); return NextResponse.json({ feedback: await updateFeedback(actor, id, body) }); }
  catch (error) { return militantApiError(error, "Segnalazione non aggiornata."); }
}
