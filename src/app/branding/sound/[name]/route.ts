import fs from "fs";
import { NextResponse } from "next/server";
import { customSound, isSoundName } from "@/lib/custom-sounds";

export const dynamic = "force-dynamic";

/** Alert sound: the one uploaded in Settings, otherwise the bundled /sounds/<name>.mp3. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name.replace(/\.mp3$/, "");
  if (!isSoundName(name)) return new NextResponse(null, { status: 404 });
  const custom = customSound(name);
  if (!custom) {
    return new NextResponse(null, { status: 307, headers: { Location: `/sounds/${name}.mp3` } });
  }
  return new NextResponse(fs.readFileSync(custom.file), {
    headers: { "Content-Type": custom.type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
  });
}
