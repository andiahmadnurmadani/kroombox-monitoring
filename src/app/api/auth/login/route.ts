import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { clearLoginFailures, clientIp, loginBlockedFor, recordLoginFailure } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const wait = loginBlockedFor(ip);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(wait / 60)} menit.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  // mark the cookie Secure when the browser reached us over HTTPS (directly or via a proxy)
  const secure = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const ok = await login(username, password, secure);
  if (!ok) {
    recordLoginFailure(ip);
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }
  clearLoginFailures(ip);
  return NextResponse.json({ ok: true });
}
