import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { infraMonitor } from "@/lib/infra-monitor";
import { store } from "@/lib/store";

/** Snapshot of everything on the dashboard (the same data it receives over /ws). */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ monitors: store.list(), hosts: infraMonitor().list() });
}
