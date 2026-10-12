import crypto from "crypto";
import { dataFile, readJson, writeJson } from "./data-dir";

const AUTH_FILE = "auth.json";
const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

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
  const saved = readJson<AuthConfig>(dataFile(AUTH_FILE));
  if (saved?.passwordHash && saved.sessionSecret) return saved;

  // First start: no well-known default password. ADMIN_PASSWORD (set by the
  // installer or the operator) wins; otherwise a random one is printed once to the
  // log, the same way e.g. Jenkins/Grafana-style first-run setups do it.
  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const given = process.env.ADMIN_PASSWORD ?? "";
  const password = given || crypto.randomBytes(9).toString("base64url");
  const cfg: AuthConfig = {
    username,
    passwordHash: hashPassword(password),
    sessionSecret: crypto.randomBytes(32).toString("hex"),
  };
  saveAuthConfig(cfg);
  if (!given) {
    console.log("================================================================");
    console.log(` Initial admin account created -> username: ${username}  password: ${password}`);
    console.log(" Change it soon in Settings, or run: npm run passwd");
    console.log("================================================================");
  }
  return cfg;
}

export function saveAuthConfig(cfg: AuthConfig) {
  // holds the password hash and the cookie-signing secret: owner-only
  writeJson(dataFile(AUTH_FILE), cfg, 0o600);
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
    return { ok: false, error: "Current password is wrong" };
  }
  if (nextUsername && nextUsername.trim()) cfg.username = nextUsername.trim();
  if (nextPassword) {
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    cfg.passwordHash = hashPassword(nextPassword);
  }
  saveAuthConfig(cfg);
  return { ok: true };
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SEC = SESSION_DAYS * 24 * 3600;
