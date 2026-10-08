import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ok = await login(username, password);
  if (!ok) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
