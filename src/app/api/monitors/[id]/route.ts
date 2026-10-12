import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { reschedule, unschedule } from "@/lib/scheduler";
import { isAuthenticated } from "@/lib/auth";
import { parseRetryFields, type RetryFields } from "@/lib/monitor-rules";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const patch: { name?: string; url?: string; intervalSec?: number } & RetryFields = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    patch.name = body.name;
  }
  if (body.url !== undefined) {
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    patch.url = body.url;
  }
  if (body.intervalSec !== undefined) {
    const n = Number(body.intervalSec);
    if (!Number.isFinite(n) || n < 5) {
      return NextResponse.json({ error: "Heartbeat interval must be at least 5 seconds" }, { status: 400 });
    }
    patch.intervalSec = n;
  }
  const retry = parseRetryFields(body);
  if (!retry.ok) {
    return NextResponse.json({ error: retry.error }, { status: 400 });
  }
  Object.assign(patch, retry.value);

  const monitor = store.update(id, patch);
  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }
  if (patch.intervalSec !== undefined || patch.retryIntervalSec !== undefined || patch.url !== undefined) {
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
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
