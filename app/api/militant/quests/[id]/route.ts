import { NextResponse } from "next/server";
import { requireMilitant } from "@/lib/militant";
import { questProgressAction } from "@/lib/militant-progression";
import { militantApiError } from "@/lib/militant-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireMilitant(request);
    const { id } = await context.params;
    const input = await request.json().catch(() => ({}));
    return NextResponse.json({ progression: await questProgressAction(actor, id, input) });
  } catch (error) {
    return militantApiError(error, "Missione non aggiornata.");
  }
}
