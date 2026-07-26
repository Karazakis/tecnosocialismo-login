import { NextResponse } from "next/server";
import { MilitantError } from "@/lib/militant";

export function militantApiError(error: unknown, fallback: string) {
  if (error instanceof MilitantError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback, code: "INTERNAL_ERROR" }, { status: 500 });
}
