import { NextResponse } from "next/server";
import { ensureMessageSchema, pool } from "@/db";

export async function GET() {
  try {
    await ensureMessageSchema();
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, service: "messaggi" });
  } catch {
    return NextResponse.json({ ok: false, service: "messaggi" }, { status: 503 });
  }
}
