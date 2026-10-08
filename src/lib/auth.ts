import { cookies } from "next/headers";
import {
  loadAuthConfig,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  changeCredentialsCore,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "./session-token";

export async function login(username: string, password: string): Promise<boolean> {
  const cfg = loadAuthConfig();
  if (username !== cfg.username || !verifyPassword(password, cfg.passwordHash)) {
    return false;
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(cfg.username), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return true;
}

export async function logout() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function changeCredentials(
  currentPassword: string,
  nextUsername: string | undefined,
  nextPassword: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  // existing sessions are signed with sessionSecret, which is untouched here,
  // so they remain valid after a credential change (expected: don't log the user out of their own change)
  return changeCredentialsCore(currentPassword, nextUsername, nextPassword);
}

export function getUsername(): string {
  return loadAuthConfig().username;
}
