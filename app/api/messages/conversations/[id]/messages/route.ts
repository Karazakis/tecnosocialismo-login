import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/request-user";
import { listMessages, MessageError, sendMessage } from "@/lib/messages";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const { id } = await context.params;
  try {
    return NextResponse.json({ messages: await listMessages(id, user) });
  } catch (error) {
    return handleError(error, "Non è stato possibile caricare i messaggi.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const { id } = await context.params;
  const payload = await request.json().catch(() => ({})) as { body?: unknown };
  try {
    return NextResponse.json({ message: await sendMessage(id, user, payload.body) }, { status: 201 });
  } catch (error) {
    return handleError(error, "Non è stato possibile inviare il messaggio.");
  }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
