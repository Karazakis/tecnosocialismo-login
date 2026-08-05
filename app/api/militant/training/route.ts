import { NextResponse } from "next/server";
import { requireMilitant } from "@/lib/militant";
import { completeTraining } from "@/lib/militant-progression";
import { militantApiError } from "@/lib/militant-response";

export async function POST(request: Request) {
  try {
    const actor = await requireMilitant(request);
    const input = await request.json().catch(() => ({}));
    return NextResponse.json({ progression: await completeTraining(actor, input) });
  } catch (error) {
    return militantApiError(error, "Modulo di formazione non completato.");
  }
}
