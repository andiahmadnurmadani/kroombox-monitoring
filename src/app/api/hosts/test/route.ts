import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { fetchDsmDisks } from "@/lib/dsm-client";
import { hostStore, parseHostInput } from "@/lib/host-store";
import { dsmTarget } from "@/lib/infra-monitor";
import { sshProbe } from "@/lib/persistent-ssh-poller";
import { PROC_METRICS_COMMAND, parseProcMetrics } from "@/lib/proc-metrics";

/** "Test connection" in the host form: one SSH login + metrics read (and one DSM query
 * for a NAS) with the values currently in the form, before anything is saved. */
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  // editing: blank secrets in the form mean "use the stored ones"
  const existing = typeof body.id === "string" ? hostStore().get(body.id) : undefined;
  const parsed = parseHostInput(body, existing);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const c = parsed.config;

  const [ssh, dsm] = await Promise.all([
    sshProbe({ host: c.host, port: c.port, username: c.username, auth: c.auth }, PROC_METRICS_COMMAND, parseProcMetrics),
    (async () => {
      const target = dsmTarget(c);
      return target ? fetchDsmDisks(target) : null;
    })(),
  ]);

  return NextResponse.json({
    ssh: { ok: ssh.result !== null, error: ssh.error, metrics: ssh.result },
    dsm: dsm ? { ok: dsm.disks !== null, error: dsm.error, diskCount: dsm.disks?.length ?? 0 } : null,
  });
}
