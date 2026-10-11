import { Client, type ConnectConfig } from "ssh2";
import type { SshAuth } from "./host-types";

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  auth: SshAuth;
}

const EXEC_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 8000;

export function connectConfig(target: SshTarget): ConnectConfig {
  return {
    host: target.host,
    port: target.port,
    username: target.username,
    ...(target.auth.method === "password"
      ? { password: target.auth.password, tryKeyboard: false }
      : { privateKey: target.auth.privateKey, passphrase: target.auth.passphrase }),
    readyTimeout: CONNECT_TIMEOUT_MS,
    keepaliveInterval: 10_000,
  };
}

/** Maps ssh2/socket errors to a short, actionable message for the dashboard. */
export function describeSshError(err: unknown): string {
  const e = err as { level?: string; code?: string; message?: string } | undefined;
  if (e?.level === "client-authentication") return "Login SSH ditolak (username/password/key salah)";
  if (e?.level === "client-timeout") return "Timeout saat menyambung SSH";
  switch (e?.code) {
    case "ECONNREFUSED":
      return "Port SSH menolak koneksi";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Host tidak terjangkau dari server monitoring";
    case "ETIMEDOUT":
      return "Timeout saat menyambung SSH";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Hostname tidak ditemukan (DNS)";
    case "ECONNRESET":
      return "Koneksi SSH diputus";
  }
  const msg = e?.message ?? String(err);
  if (/Cannot parse privateKey|Encrypted private key/i.test(msg)) return "Private key tidak bisa dibaca (passphrase salah?)";
  return msg || "Tidak terjangkau";
}

/**
 * Keeps ONE SSH connection open to a host and re-runs a read-only command over it
 * on a fixed interval, instead of reconnecting (full TCP + key-exchange + auth)
 * every tick. That's what makes a ~1s refresh safe on a production box: the
 * expensive part (the handshake) happens once, not every poll.
 */
export class PersistentSshPoller<T> {
  private static readonly MAX_BACKOFF_MS = 60_000;

  private conn: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private consecutiveConnectFailures = 0;

  constructor(
    private target: SshTarget,
    private intervalMs: number,
    private command: string,
    private parse: (output: string) => T | null,
    private onResult: (result: T | null, error: string | null) => void
  ) {}

  start() {
    this.stopped = false;
    this.loop();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.conn?.end();
    this.conn = null;
  }

  private connect(): Promise<Client> {
    if (this.conn) return Promise.resolve(this.conn);
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const conn = new Client();
      conn
        .on("ready", () => {
          this.connecting = null;
          if (this.stopped) {
            // stop() ran while we were still handshaking: don't leak this connection
            conn.end();
            reject(new Error("stopped"));
            return;
          }
          this.conn = conn;
          resolve(conn);
        })
        .on("error", (err) => {
          this.conn = null;
          this.connecting = null;
          reject(err);
        })
        .on("close", () => {
          // next loop() tick reconnects automatically
          if (this.conn === conn) this.conn = null;
        })
        .connect(connectConfig(this.target));
    });
    return this.connecting;
  }

  private async loop() {
    if (this.stopped) return;
    let nextDelay = this.intervalMs;
    try {
      const conn = await this.connect();
      this.consecutiveConnectFailures = 0;
      const result = await execParse(conn, this.command, this.parse);
      if (this.stopped) return;
      this.onResult(result, result === null ? "Perintah metrik gagal dijalankan (host bukan Linux?)" : null);
    } catch (err) {
      if (this.stopped) return;
      this.onResult(null, describeSshError(err));
      // a *connect* failure (vs. a one-off exec hiccup on an already-open
      // connection) means re-authenticating — retrying every intervalMs here
      // would, during a real outage, look exactly like a burst of login
      // attempts to the remote host's own brute-force protection (e.g.
      // Synology's AutoBlock, fail2ban) and get us locked out ourselves. Back
      // off exponentially instead, capped so we still recover reasonably fast.
      this.consecutiveConnectFailures++;
      nextDelay = Math.min(
        Math.max(this.intervalMs, 1000) * 2 ** this.consecutiveConnectFailures,
        PersistentSshPoller.MAX_BACKOFF_MS
      );
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => this.loop(), nextDelay);
    }
  }
}

export function execParse<T>(conn: Client, command: string, parse: (out: string) => T | null): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), EXEC_TIMEOUT_MS);
    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        resolve(null);
        return;
      }
      let out = "";
      stream
        .on("data", (chunk: Buffer) => (out += chunk.toString()))
        .on("close", () => {
          clearTimeout(timer);
          resolve(parse(out));
        });
      stream.stderr.on("data", () => {});
    });
  });
}

/** One connect + one command + disconnect: used by the "Test koneksi" button. */
export function sshProbe<T>(
  target: SshTarget,
  command: string,
  parse: (out: string) => T | null
): Promise<{ result: T | null; error: string | null }> {
  return new Promise((resolve) => {
    const conn = new Client();
    let settled = false;
    const done = (value: { result: T | null; error: string | null }) => {
      if (settled) return;
      settled = true;
      conn.end();
      resolve(value);
    };
    conn
      .on("ready", async () => {
        const result = await execParse(conn, command, parse);
        done({ result, error: result === null ? "Login berhasil, tapi perintah metrik gagal (host bukan Linux?)" : null });
      })
      .on("error", (err) => done({ result: null, error: describeSshError(err) }))
      .connect(connectConfig(target));
  });
}
