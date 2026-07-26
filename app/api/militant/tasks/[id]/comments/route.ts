import { NextResponse } from "next/server";
import { addComment, listComments, requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireMilitant(request); const { id } = await context.params; return NextResponse.json({ comments: await listComments(id) }); }
  catch (error) { return militantApiError(error, "Commenti non disponibili."); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireMilitant(request, "contributor"); const { id } = await context.params; const body = await request.json().catch(() => ({})) as { body?: unknown }; return NextResponse.json({ comment: await addComment(actor, id, body.body) }, { status: 201 }); }
  catch (error) { return militantApiError(error, "Commento non pubblicato."); }
}
