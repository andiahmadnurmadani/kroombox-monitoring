import fs from "fs";
import path from "path";
import crypto from "crypto";

const AUTH_FILE = path.join(process.cwd(), "data", "auth.json");
const SESSION_DAYS = 30;

interface AuthConfig {
  username: string;
  passwordHash: string; // "<saltHex>:<hashHex>"
  sessionSecret: string;
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function loadAuthConfig(): AuthConfig {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    }
  } catch {
    // fall through to reseed defaults below
  }
  const cfg: AuthConfig = {
    username: "admin",
    passwordHash: hashPassword("admin"),
    sessionSecret: crypto.randomBytes(32).toString("hex"),
  };
  saveAuthConfig(cfg);
  return cfg;
}

export function saveAuthConfig(cfg: AuthConfig) {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(cfg, null, 2));
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(username: string): string {
  const cfg = loadAuthConfig();
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  return `${payload}.${sign(payload, cfg.sessionSecret)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const cfg = loadAuthConfig();
  const expected = sign(payload, cfg.sessionSecret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && Date.now() <= data.exp;
  } catch {
    return false;
  }
}

/** Parses the raw `Cookie` header (as seen on a plain Node http request) and
 * verifies the session token in it — used outside Next's request context,
 * e.g. the custom server's WebSocket upgrade handler. */
export function verifySessionFromCookieHeader(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="));
  if (!match) return false;
  return verifySessionToken(decodeURIComponent(match.slice("session=".length)));
}

export function changeCredentialsCore(
  currentPassword: string,
  nextUsername: string | undefined,
  nextPassword: string | undefined
): { ok: boolean; error?: string } {
  const cfg = loadAuthConfig();
  if (!verifyPassword(currentPassword, cfg.passwordHash)) {
    return { ok: false, error: "Password saat ini salah" };
  }
  if (nextUsername && nextUsername.trim()) cfg.username = nextUsername.trim();
  if (nextPassword) {
    if (nextPassword.length < 4) {
      return { ok: false, error: "Password baru minimal 4 karakter" };
    }
    cfg.passwordHash = hashPassword(nextPassword);
  }
  saveAuthConfig(cfg);
  return { ok: true };
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 3600;
