import { NextResponse } from "next/server";
import { requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";
import { monitorServices } from "@/lib/militant-services";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireMilitant(request); return NextResponse.json({ services: await monitorServices() }); }
  catch (error) { return militantApiError(error, "Monitoraggio non disponibile."); }
}
