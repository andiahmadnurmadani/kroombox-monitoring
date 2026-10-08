import https from "https";
import type { DiskInfo, NasStatus } from "./nas-types";

const HOST = process.env.NAS_HOST ?? "";
const PORT = Number(process.env.NAS_PORT ?? "5001");
const USER = process.env.NAS_USER ?? "";
const PASS = process.env.NAS_PASS ?? "";
const LABEL = process.env.NAS_LABEL ?? "NAS";
const TIMEOUT_MS = 8000;
const SESSION_NAME = "uptime-monitor";

interface DsmResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: number };
}

function dsmRequest<T = Record<string, unknown>>(
  query: Record<string, string>
): Promise<DsmResponse<T>> {
  const qs = new URLSearchParams(query).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        port: PORT,
        path: `/webapi/entry.cgi?${qs}`,
        method: "GET",
        // DSM uses a self-signed cert on the LAN/Tailscale-only management port;
        // this call never leaves the tailnet, so we skip verification for it only.
        rejectUnauthorized: false,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Respons DSM bukan JSON valid"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Koneksi ke DSM timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchNasStatus(): Promise<NasStatus> {
  const base: NasStatus = {
    label: LABEL,
    reachable: false,
    disks: [],
    cpuLoad: null,
    memory: null,
    uptimeSec: null,
    lastCheckedAt: Date.now(),
    error: null,
  };

  if (!HOST || !USER || !PASS) {
    return { ...base, error: "NAS belum dikonfigurasi (.env.local)" };
  }

  let sid: string | null = null;
  try {
    const loginRes = await dsmRequest<{ sid: string }>({
      api: "SYNO.API.Auth",
      version: "6",
      method: "login",
      account: USER,
      passwd: PASS,
      session: SESSION_NAME,
      format: "sid",
    });
    if (!loginRes.success || !loginRes.data?.sid) {
      return { ...base, error: `Login NAS gagal (kode ${loginRes.error?.code ?? "?"})` };
    }
    sid = loginRes.data.sid;

    const storageRes = await dsmRequest<{ disks: Array<Record<string, unknown>> }>({
      api: "SYNO.Storage.CGI.Storage",
      version: "1",
      method: "load_info",
      _sid: sid,
    });
    if (!storageRes.success) {
      return { ...base, error: `Gagal baca storage info (kode ${storageRes.error?.code ?? "?"})` };
    }

    const disks: DiskInfo[] = (storageRes.data?.disks ?? []).map((d) => ({
      id: String(d.id ?? ""),
      name: String(d.name ?? d.id ?? "disk"),
      model: String(d.model ?? "-"),
      tempC: typeof d.temp === "number" ? d.temp : null,
      status: typeof d.status === "string" ? d.status : null,
      smartStatus: typeof d.smart_status === "string" ? d.smart_status : null,
    }));

    return { ...base, reachable: true, disks };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (sid) {
      try {
        await dsmRequest({
          api: "SYNO.API.Auth",
          version: "6",
          method: "logout",
          session: SESSION_NAME,
          _sid: sid,
        });
      } catch {
        // best-effort logout; a stale session on DSM expires on its own
      }
    }
  }
}
