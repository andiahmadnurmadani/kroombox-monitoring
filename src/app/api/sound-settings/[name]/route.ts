import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isSoundName, MAX_SOUND_BYTES, removeSound, saveSound, sniffSound } from "@/lib/custom-sounds";

type Params = { params: Promise<{ name: string }> };

/** Upload a replacement alert sound (form field "sound"). */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = (await params).name;
  if (!isSoundName(name)) return NextResponse.json({ error: "Unknown sound type" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("sound");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Choose an audio file" }, { status: 400 });
  }
  if (file.size > MAX_SOUND_BYTES) {
    return NextResponse.json({ error: "Sound file must be 1 MB or smaller" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffSound(buf);
  if (!ext) {
    return NextResponse.json({ error: "Format must be MP3, WAV, OGG or M4A" }, { status: 400 });
  }
  saveSound(name, buf, ext);
  return NextResponse.json({ ok: true });
}

/** Back to the bundled sound. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = (await params).name;
  if (!isSoundName(name)) return NextResponse.json({ error: "Unknown sound type" }, { status: 404 });
  removeSound(name);
  return NextResponse.json({ ok: true });
}
