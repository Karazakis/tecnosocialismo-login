import { NextResponse } from "next/server";
import { requireMilitant } from "@/lib/militant";
import { getMilitantProgression } from "@/lib/militant-progression";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireMilitant(request);
    return NextResponse.json({ progression: await getMilitantProgression(actor) });
  } catch (error) {
    return militantApiError(error, "Percorso militante non disponibile.");
  }
}
