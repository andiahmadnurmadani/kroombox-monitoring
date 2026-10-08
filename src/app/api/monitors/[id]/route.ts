import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { reschedule, unschedule } from "@/lib/scheduler";
import { isAuthenticated } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const patch: { name?: string; url?: string; intervalSec?: number } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Nama tidak boleh kosong" }, { status: 400 });
    }
    patch.name = body.name;
  }
  if (body.url !== undefined) {
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: "URL tidak valid" }, { status: 400 });
    }
    patch.url = body.url;
  }
  if (body.intervalSec !== undefined) {
    const n = Number(body.intervalSec);
    if (!Number.isFinite(n) || n < 5) {
      return NextResponse.json({ error: "Interval heartbeat minimal 5 detik" }, { status: 400 });
    }
    patch.intervalSec = n;
  }

  const monitor = store.update(id, patch);
  if (!monitor) {
    return NextResponse.json({ error: "Monitor tidak ditemukan" }, { status: 404 });
  }
  if (patch.intervalSec !== undefined || patch.url !== undefined) {
    reschedule(id);
  }
  return NextResponse.json({ monitor });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  unschedule(id);
  const removed = store.remove(id);
  if (!removed) {
    return NextResponse.json({ error: "Monitor tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
