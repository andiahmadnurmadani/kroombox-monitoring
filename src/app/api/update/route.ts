import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { installedVersion, readUpdateStatus, requestUpdate, updatesSupported } from "@/lib/updates";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    supported: updatesSupported(),
    running: installedVersion(),
    status: readUpdateStatus(),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "check" && action !== "apply") {
    return NextResponse.json({ error: "Action must be \"check\" or \"apply\"" }, { status: 400 });
  }
  if (!updatesSupported()) {
    return NextResponse.json(
      { error: "One-click updates need the systemd install (sudo ./scripts/install.sh)" },
      { status: 501 }
    );
  }
  // an "updating" state older than the updater's own 30 min timeout is left over from a crash
  const { state, startedAt } = readUpdateStatus();
  if (state === "updating" && Date.now() - (startedAt ?? 0) < 35 * 60_000) {
    return NextResponse.json({ error: "An update is already running" }, { status: 409 });
  }
  requestUpdate(action);
  return NextResponse.json({ ok: true }, { status: 202 });
}
