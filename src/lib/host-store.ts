import { randomBytes } from "crypto";
import { dataFile, readJson, writeJson } from "./data-dir";
import type { DsmConfig, HostConfig, HostKind, HostView, SshAuth } from "./host-types";

const FILE_NAME = "hosts.json";
// SSH passwords/keys live in this file: owner read/write only.
const FILE_MODE = 0o600;

export const LIMITS = {
  minIntervalSec: 1,
  maxIntervalSec: 3600,
  minDsmIntervalSec: 10,
  maxHosts: 200,
} as const;

type Listener = () => void;

interface HostsFile {
  version: 1;
  hosts: HostConfig[];
}

function newId(): string {
  return `h_${randomBytes(4).toString("hex")}`;
}

export function toView(c: HostConfig): HostView {
  return {
    id: c.id,
    kind: c.kind,
    label: c.label,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.auth.method,
    hasPassword: c.auth.method === "password" && !!c.auth.password,
    hasPrivateKey: c.auth.method === "key" && !!c.auth.privateKey,
    intervalSec: c.intervalSec,
    enabled: c.enabled,
    createdAt: c.createdAt,
    dsm: c.dsm
      ? {
          enabled: c.dsm.enabled,
          port: c.dsm.port,
          https: c.dsm.https,
          intervalSec: c.dsm.intervalSec,
          username: c.dsm.username,
          hasPassword: !!c.dsm.password,
        }
      : undefined,
  };
}

// --- validation -----------------------------------------------------------

const HOST_RE = /^[A-Za-z0-9._:\-\[\]%]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export type ParseResult = { ok: true; config: HostConfig } | { ok: false; error: string };

/**
 * Turns an untrusted request body into a HostConfig. When `existing` is given (an
 * edit), every secret left empty keeps its stored value — the browser never sees
 * stored secrets, so "empty" has to mean "unchanged", not "remove".
 */
export function parseHostInput(body: Record<string, unknown>, existing?: HostConfig): ParseResult {
  const kind = (body.kind ?? existing?.kind ?? "server") as HostKind;
  if (kind !== "server" && kind !== "nas") return { ok: false, error: "Jenis host tidak dikenal" };

  const label = str(body.label ?? existing?.label);
  if (!label) return { ok: false, error: "Nama wajib diisi" };
  if (label.length > 60) return { ok: false, error: "Nama maksimal 60 karakter" };

  const host = str(body.host ?? existing?.host);
  if (!host || host.length > 253 || !HOST_RE.test(host)) {
    return { ok: false, error: "Alamat host tidak valid (IP atau hostname)" };
  }

  const port = int(body.port, existing?.port ?? 22);
  if (!(port >= 1 && port <= 65535)) return { ok: false, error: "Port SSH harus 1-65535" };

  const username = str(body.username ?? existing?.username);
  if (!username || username.length > 64 || /\s/.test(username)) {
    return { ok: false, error: "Username SSH tidak valid" };
  }

  const intervalSec = int(body.intervalSec, existing?.intervalSec ?? 5);
  if (!(intervalSec >= LIMITS.minIntervalSec && intervalSec <= LIMITS.maxIntervalSec)) {
    return { ok: false, error: `Interval harus ${LIMITS.minIntervalSec}-${LIMITS.maxIntervalSec} detik` };
  }

  // A stored password is only reused for the very same destination: otherwise
  // pointing an existing host at another machine (and pressing "Test koneksi")
  // would hand the saved password to whoever runs that machine.
  const sameSshTarget =
    !!existing && host === existing.host && port === existing.port && username === existing.username;

  const method = (body.authMethod ?? existing?.auth.method ?? "password") as SshAuth["method"];
  let auth: SshAuth;
  if (method === "password") {
    const given = typeof body.password === "string" ? body.password : "";
    const kept = sameSshTarget && existing?.auth.method === "password" ? existing.auth.password : "";
    const password = given || kept;
    if (!password) {
      return {
        ok: false,
        error: existing?.auth.method === "password" && !sameSshTarget
          ? "Host, port, atau username berubah: masukkan ulang password SSH"
          : "Password SSH wajib diisi",
      };
    }
    auth = { method: "password", password };
  } else if (method === "key") {
    const given = typeof body.privateKey === "string" ? body.privateKey.trim() : "";
    const kept = existing?.auth.method === "key" ? existing.auth.privateKey : "";
    const privateKey = given ? `${given}\n` : kept;
    if (!privateKey) return { ok: false, error: "Private key SSH wajib diisi" };
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
      return { ok: false, error: "Format private key tidak dikenali (harus PEM/OpenSSH)" };
    }
    const givenPass = typeof body.passphrase === "string" ? body.passphrase : "";
    const keptPass = existing?.auth.method === "key" && given === "" ? existing.auth.passphrase : undefined;
    const passphrase = givenPass || keptPass || undefined;
    auth = { method: "key", privateKey, ...(passphrase ? { passphrase } : {}) };
  } else {
    return { ok: false, error: "Metode autentikasi tidak dikenal" };
  }

  let dsm: DsmConfig | undefined;
  if (kind === "nas") {
    const raw = (body.dsm && typeof body.dsm === "object" ? body.dsm : {}) as Record<string, unknown>;
    const prev = existing?.dsm;
    const enabled = bool(raw.enabled, prev?.enabled ?? false);
    const dsmPort = int(raw.port, prev?.port ?? 5001);
    if (!(dsmPort >= 1 && dsmPort <= 65535)) return { ok: false, error: "Port DSM harus 1-65535" };
    const dsmInterval = int(raw.intervalSec, prev?.intervalSec ?? 15);
    if (!(dsmInterval >= LIMITS.minDsmIntervalSec && dsmInterval <= LIMITS.maxIntervalSec)) {
      return { ok: false, error: `Interval DSM harus ${LIMITS.minDsmIntervalSec}-${LIMITS.maxIntervalSec} detik` };
    }
    const dsmUser = raw.username !== undefined ? str(raw.username) : prev?.username ?? "";
    const dsmPassGiven = typeof raw.password === "string" ? raw.password : "";
    const dsmHttps = bool(raw.https, prev?.https ?? true);
    // same rule as SSH: the stored DSM password only goes back to the same DSM.
    // Switching to "same as SSH" (empty username) drops it so it doesn't linger.
    const sameDsmTarget =
      !!prev && host === existing?.host && dsmPort === prev.port && dsmHttps === prev.https && dsmUser === (prev.username ?? "");
    const dsmPass = dsmUser ? dsmPassGiven || (sameDsmTarget ? prev?.password : "") || "" : "";
    dsm = {
      enabled,
      port: dsmPort,
      https: dsmHttps,
      intervalSec: dsmInterval,
      ...(dsmUser ? { username: dsmUser } : {}),
      ...(dsmPass ? { password: dsmPass } : {}),
    };
    if (enabled && dsmUser && !dsmPass) {
      return {
        ok: false,
        error: prev?.password && !sameDsmTarget
          ? "Alamat, port, atau akun DSM berubah: masukkan ulang password DSM"
          : "Password DSM wajib diisi bila akun DSM berbeda dari SSH",
      };
    }
  }

  return {
    ok: true,
    config: {
      id: existing?.id ?? newId(),
      kind,
      label,
      host,
      port,
      username,
      auth,
      intervalSec,
      enabled: bool(body.enabled, existing?.enabled ?? true),
      createdAt: existing?.createdAt ?? Date.now(),
      ...(dsm ? { dsm } : {}),
    },
  };
}

// --- one-time import of the old .env.local configuration ------------------

interface LegacyServer {
  id?: string;
  label?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

/**
 * Before hosts were editable in the UI they came from NAS_* and SERVERS_JSON in
 * .env.local. The first start of this version copies them into hosts.json once, so
 * an upgrade keeps monitoring exactly the same machines without manual steps.
 */
export function hostsFromLegacyEnv(env: Record<string, string | undefined>): HostConfig[] {
  const out: HostConfig[] = [];
  const now = Date.now();
  const nasHost = env.NAS_HOST?.trim();
  if (nasHost && env.NAS_USER && env.NAS_PASS) {
    const dsmPort = Number(env.NAS_PORT ?? "5001");
    out.push({
      id: "nas",
      kind: "nas",
      label: env.NAS_LABEL?.trim() || "NAS",
      host: nasHost,
      port: Number(env.NAS_SSH_PORT ?? "22") || 22,
      username: env.NAS_USER,
      auth: { method: "password", password: env.NAS_PASS },
      intervalSec: Math.max(1, Math.round(Number(env.NAS_SSH_INTERVAL_MS ?? "1000") / 1000) || 1),
      enabled: true,
      createdAt: now,
      dsm: {
        enabled: true,
        port: Number.isFinite(dsmPort) ? dsmPort : 5001,
        https: (env.NAS_DSM_HTTPS ?? "true") !== "false",
        intervalSec: Math.max(10, Number(env.NAS_INTERVAL_SEC ?? "15") || 15),
      },
    });
  }
  let servers: LegacyServer[] = [];
  try {
    const parsed = JSON.parse(env.SERVERS_JSON ?? "[]");
    if (Array.isArray(parsed)) servers = parsed;
  } catch {
    console.error("SERVERS_JSON lama tidak valid JSON, tidak diimpor");
  }
  const intervalSec = Math.max(1, Math.round(Number(env.SERVERS_INTERVAL_MS ?? "1000") / 1000) || 1);
  servers.forEach((s, i) => {
    if (!s.host || !s.username || !s.password) return;
    out.push({
      id: s.id && /^[\w-]{1,40}$/.test(s.id) && s.id !== "nas" ? s.id : newId(),
      kind: "server",
      label: s.label || s.host,
      host: s.host,
      port: s.port ?? 22,
      username: s.username,
      auth: { method: "password", password: s.password },
      intervalSec,
      enabled: true,
      createdAt: now + i + 1,
    });
  });
  return out;
}

// --- store ------------------------------------------------------------------

class HostStore {
  private hosts: HostConfig[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    const saved = readJson<HostsFile>(dataFile(FILE_NAME));
    if (saved && Array.isArray(saved.hosts)) {
      this.hosts = saved.hosts;
    } else {
      this.hosts = hostsFromLegacyEnv(process.env);
      if (this.hosts.length > 0) {
        console.log(`hosts.json dibuat dari konfigurasi lama .env.local (${this.hosts.length} host)`);
      }
      this.save();
    }
  }

  private save() {
    writeJson(dataFile(FILE_NAME), { version: 1, hosts: this.hosts } satisfies HostsFile, FILE_MODE);
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.save();
    for (const fn of this.listeners) fn();
  }

  list(): HostConfig[] {
    return this.hosts.slice();
  }

  get(id: string): HostConfig | undefined {
    return this.hosts.find((h) => h.id === id);
  }

  add(config: HostConfig): HostConfig | string {
    if (this.hosts.length >= LIMITS.maxHosts) return `Maksimal ${LIMITS.maxHosts} host`;
    this.hosts.push(config);
    this.changed();
    return config;
  }

  replace(config: HostConfig): boolean {
    const i = this.hosts.findIndex((h) => h.id === config.id);
    if (i < 0) return false;
    this.hosts[i] = config;
    this.changed();
    return true;
  }

  remove(id: string): boolean {
    const before = this.hosts.length;
    this.hosts = this.hosts.filter((h) => h.id !== id);
    if (this.hosts.length === before) return false;
    this.changed();
    return true;
  }
}

declare global {
  var __hostStore: HostStore | undefined;
}

export function hostStore(): HostStore {
  // one instance per process, shared by instrumentation and route handlers (which
  // Next may load as separate module copies)
  if (!global.__hostStore) global.__hostStore = new HostStore();
  return global.__hostStore;
}
