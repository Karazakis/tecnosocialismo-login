import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/request-user";
import { markConversationRead, MessageError } from "@/lib/messages";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Accesso richiesto." }, { status: 401 });
  const { id } = await context.params;
  try {
    await markConversationRead(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MessageError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Lettura non aggiornata." }, { status: 500 });
  }
}
