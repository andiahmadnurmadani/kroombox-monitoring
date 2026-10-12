import http from "http";
import https from "https";
import type { DiskInfo } from "./host-types";

/** Synology DSM web API: disk temperatures (and SMART status) for a NAS. */
export interface DsmTarget {
  host: string;
  port: number;
  https: boolean;
  username: string;
  password: string;
}

const TIMEOUT_MS = 8000;
const SESSION_NAME = "kroombox-monitor";

interface DsmResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: number };
}

// https://global.download.synology.com/download/Document/Software/DeveloperGuide/Os/DSM/All/enu/DSM_Login_Web_API_Guide_enu.pdf
const LOGIN_ERRORS: Record<number, string> = {
  400: "wrong DSM account or password",
  401: "DSM account is disabled",
  402: "DSM account permission denied",
  403: "DSM asks for a 2FA code (use an account without 2FA)",
  407: "IP blocked by DSM AutoBlock",
};

function dsmRequest<T = Record<string, unknown>>(
  target: DsmTarget,
  query: Record<string, string>
): Promise<DsmResponse<T>> {
  const qs = new URLSearchParams(query).toString();
  const mod = target.https ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        host: target.host,
        port: target.port,
        path: `/webapi/entry.cgi?${qs}`,
        method: "GET",
        // DSM uses a self-signed cert on the LAN/VPN management port; this call is
        // meant to stay inside that private network, so verification is skipped.
        ...(target.https ? { rejectUnauthorized: false } : {}),
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("DSM response is not JSON (wrong port/protocol?)"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Connection to DSM timed out")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchDsmDisks(target: DsmTarget): Promise<{ disks: DiskInfo[] | null; error: string | null }> {
  let sid: string | null = null;
  try {
    const loginRes = await dsmRequest<{ sid: string }>(target, {
      api: "SYNO.API.Auth",
      version: "6",
      method: "login",
      account: target.username,
      passwd: target.password,
      session: SESSION_NAME,
      format: "sid",
    });
    if (!loginRes.success || !loginRes.data?.sid) {
      const code = loginRes.error?.code;
      return { disks: null, error: `DSM login failed: ${(code && LOGIN_ERRORS[code]) || `code ${code ?? "?"}`}` };
    }
    sid = loginRes.data.sid;

    const storageRes = await dsmRequest<{ disks: Array<Record<string, unknown>> }>(target, {
      api: "SYNO.Storage.CGI.Storage",
      version: "1",
      method: "load_info",
      _sid: sid,
    });
    if (!storageRes.success) {
      return { disks: null, error: `Failed to read DSM storage info (code ${storageRes.error?.code ?? "?"}, the account must be an admin)` };
    }

    const disks: DiskInfo[] = (storageRes.data?.disks ?? []).map((d) => ({
      id: String(d.id ?? ""),
      name: String(d.name ?? d.id ?? "disk"),
      model: String(d.model ?? "-"),
      tempC: typeof d.temp === "number" ? d.temp : null,
      status: typeof d.status === "string" ? d.status : null,
      smartStatus: typeof d.smart_status === "string" ? d.smart_status : null,
    }));
    return { disks, error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ECONNREFUSED") return { disks: null, error: "DSM port refused the connection" };
    if (e.code === "EPROTO") return { disks: null, error: "Wrong DSM protocol (try switching HTTPS/HTTP)" };
    return { disks: null, error: e.message ?? String(err) };
  } finally {
    if (sid) {
      try {
        await dsmRequest(target, { api: "SYNO.API.Auth", version: "6", method: "logout", session: SESSION_NAME, _sid: sid });
      } catch {
        // best-effort logout; a stale session on DSM expires on its own
      }
    }
  }
}
