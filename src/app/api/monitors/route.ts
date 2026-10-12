import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { ensureScheduled } from "@/lib/scheduler";
import { isAuthenticated } from "@/lib/auth";
import { parseRetryFields } from "@/lib/monitor-rules";

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
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (!Number.isFinite(intervalSec) || intervalSec < 5) {
    return NextResponse.json({ error: "Heartbeat interval must be at least 5 seconds" }, { status: 400 });
  }

  const retry = parseRetryFields(body);
  if (!retry.ok) {
    return NextResponse.json({ error: retry.error }, { status: 400 });
  }

  const monitor = store.create({ name, url, intervalSec, ...retry.value });
  ensureScheduled(monitor.id);
  return NextResponse.json({ monitor }, { status: 201 });
}
