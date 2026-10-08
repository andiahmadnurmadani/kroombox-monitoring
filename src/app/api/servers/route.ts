import { NextResponse } from "next/server";
import { getServersStatus } from "@/lib/servers-scheduler";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ servers: getServersStatus() });
}
