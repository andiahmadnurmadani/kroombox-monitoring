import { NextRequest, NextResponse } from "next/server";
import { changeCredentials, getUsername, isAuthenticated } from "@/lib/auth";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ username: getUsername() });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newUsername = typeof body.newUsername === "string" ? body.newUsername : undefined;
  const newPassword = typeof body.newPassword === "string" && body.newPassword.length > 0
    ? body.newPassword
    : undefined;

  const result = await changeCredentials(currentPassword, newUsername, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to save" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
