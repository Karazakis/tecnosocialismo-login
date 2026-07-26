import { NextResponse } from "next/server";
import { deleteTask, requireMilitant, updateTask } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireMilitant(request, "contributor"); const { id } = await context.params; const body = await request.json().catch(() => ({})); return NextResponse.json({ task: await updateTask(actor, id, body) }); }
  catch (error) { return militantApiError(error, "Task non aggiornata."); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireMilitant(request, "admin"); const { id } = await context.params; await deleteTask(actor, id); return NextResponse.json({ ok: true }); }
  catch (error) { return militantApiError(error, "Task non eliminata."); }
}
