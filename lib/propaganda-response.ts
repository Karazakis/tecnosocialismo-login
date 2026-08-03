import { NextResponse } from "next/server";
import { PropagandaError } from "@/lib/propaganda";
import { MilitantError } from "@/lib/militant";

export function propagandaApiError(error: unknown, fallback: string) {
  if (error instanceof PropagandaError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof MilitantError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
