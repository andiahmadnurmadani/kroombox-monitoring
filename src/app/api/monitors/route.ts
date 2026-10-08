import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { ensureScheduled } from "@/lib/scheduler";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ monitors: store.list() });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const intervalSec = Number(body.intervalSec);

  if (!name) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "URL tidak valid" }, { status: 400 });
  }
  if (!Number.isFinite(intervalSec) || intervalSec < 5) {
    return NextResponse.json({ error: "Interval heartbeat minimal 5 detik" }, { status: 400 });
  }

  const monitor = store.create({ name, url, intervalSec });
  ensureScheduled(monitor.id);
  return NextResponse.json({ monitor }, { status: 201 });
}
