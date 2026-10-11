import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { hostStore, parseHostInput, toView } from "@/lib/host-store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const host = hostStore().get((await params).id);
  if (!host) return NextResponse.json({ error: "Host tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ host: toView(host) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const existing = hostStore().get((await params).id);
  if (!existing) return NextResponse.json({ error: "Host tidak ditemukan" }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  const parsed = parseHostInput(body, existing);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  hostStore().replace(parsed.config);
  return NextResponse.json({ host: toView(parsed.config) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hostStore().remove((await params).id)) {
    return NextResponse.json({ error: "Host tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
