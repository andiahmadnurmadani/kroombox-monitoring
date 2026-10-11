import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { loadSoundSettings, saveSoundSettings, isValidTime } from "@/lib/sound-settings";
import { customSound, SOUND_NAMES } from "@/lib/custom-sounds";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const custom = Object.fromEntries(SOUND_NAMES.map((n) => [n, customSound(n) !== null]));
  return NextResponse.json({ settings: loadSoundSettings(), custom });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) {
    return NextResponse.json({ error: "Format jam tidak valid (HH:MM)" }, { status: 400 });
  }

  const settings = { enabled, startTime: body.startTime, endTime: body.endTime };
  saveSoundSettings(settings);
  return NextResponse.json({ ok: true, settings });
}
