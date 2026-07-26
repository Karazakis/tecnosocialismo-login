import { NextResponse } from "next/server";
import { addMember, listMembers, requireMilitant } from "@/lib/militant";
import { militantApiError } from "@/lib/militant-response";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireMilitant(request); return NextResponse.json({ members: await listMembers() }); }
  catch (error) { return militantApiError(error, "Membri non disponibili."); }
}
export async function POST(request: Request) {
  try { const actor = await requireMilitant(request, "admin"); const body = await request.json().catch(() => ({})); return NextResponse.json({ member: await addMember(actor, body) }, { status: 201 }); }
  catch (error) { return militantApiError(error, "Membro non abilitato."); }
}
