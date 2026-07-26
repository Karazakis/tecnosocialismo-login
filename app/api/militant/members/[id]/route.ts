import { NextResponse } from "next/server";
import { requireMilitant, updateMember } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireMilitant(request, "admin"); const { id } = await context.params; const body = await request.json().catch(() => ({})); return NextResponse.json({ member: await updateMember(actor, id, body) }); }
  catch (error) { return militantApiError(error, "Membro non aggiornato."); }
}
