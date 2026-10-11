import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { MAX_LOGO_BYTES, removeLogo, saveLogo, sniffLogo } from "@/lib/app-settings";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Pilih file gambar" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "Logo maksimal 512 KB" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffLogo(buf);
  if (!ext) {
    return NextResponse.json({ error: "Format logo harus PNG, JPG, atau WebP" }, { status: 400 });
  }
  saveLogo(buf, ext);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  removeLogo();
  return NextResponse.json({ ok: true });
}
