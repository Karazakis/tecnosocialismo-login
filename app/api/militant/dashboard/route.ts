import { NextResponse } from "next/server";
import { dashboard, requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireMilitant(request); return NextResponse.json({ dashboard: await dashboard() }); }
  catch (error) { return militantApiError(error, "Dashboard non disponibile."); }
}
