import { NextResponse } from "next/server";
import { getNasStatus } from "@/lib/nas-scheduler";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ nas: getNasStatus() });
}
