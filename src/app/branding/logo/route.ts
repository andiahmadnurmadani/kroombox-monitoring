import fs from "fs";
import { NextResponse } from "next/server";
import { customLogo } from "@/lib/app-settings";

// Public on purpose: the login page and the browser tab icon need it before login.
export const dynamic = "force-dynamic";

export async function GET() {
  const logo = customLogo();
  if (!logo) {
    // relative Location: behind a proxy/tunnel the request URL's host is internal
    return new NextResponse(null, { status: 307, headers: { Location: "/logo.png" } });
  }
  return new NextResponse(fs.readFileSync(logo.file), {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
