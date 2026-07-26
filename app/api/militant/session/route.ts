import { NextResponse } from "next/server";
import { requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return NextResponse.json({ member: await requireMilitant(request) }); }
  catch (error) { return militantApiError(error, "Accesso non verificato."); }
}
