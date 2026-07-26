import { NextResponse } from "next/server";
import { createTask, listTasks, requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireMilitant(request); return NextResponse.json({ tasks: await listTasks() }); }
  catch (error) { return militantApiError(error, "Task non disponibili."); }
}
export async function POST(request: Request) {
  try { const actor = await requireMilitant(request, "coordinator"); const body = await request.json().catch(() => ({})); return NextResponse.json({ task: await createTask(actor, body) }, { status: 201 }); }
  catch (error) { return militantApiError(error, "Task non creata."); }
}
