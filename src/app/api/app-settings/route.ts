import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { customLogo, loadAppSettings, MAX_APP_NAME, saveAppSettings } from "@/lib/app-settings";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ settings: loadAppSettings(), hasCustomLogo: customLogo() !== null });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const appName = typeof body.appName === "string" ? body.appName.trim() : "";
  if (!appName || appName.length > MAX_APP_NAME) {
    return NextResponse.json({ error: `Nama aplikasi wajib diisi (maks. ${MAX_APP_NAME} karakter)` }, { status: 400 });
  }
  saveAppSettings({ appName });
  return NextResponse.json({ ok: true, settings: { appName } });
}
