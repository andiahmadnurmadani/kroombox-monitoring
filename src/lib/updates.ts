import fs from "fs";
import path from "path";
import { readJson } from "./data-dir";

export interface CommitRef {
  sha: string;
  date: string;
}

/** Written by scripts/updater.mjs (root, outside the dashboard); read-only here. */
export interface UpdateStatus {
  state?: "idle" | "checking" | "updating";
  installed?: CommitRef | null;
  latest?: CommitRef | null;
  behind?: number | null;
  updateAvailable?: boolean;
  repoUrl?: string | null;
  checkedAt?: number;
  startedAt?: number;
  finishedAt?: number | null;
  error?: string | null;
  log?: string;
  lastUpdate?: { ok: boolean; at: number; from: string | null; to: string | null };
}

export type UpdateAction = "check" | "apply";

// set by the systemd unit; root-owned, the dashboard may only write into its requests/ folder
const UPDATER_DIR = process.env.UPDATER_DIR || "";

/** One-click updates only exist for the systemd install, which creates the updater directory. */
export function updatesSupported(): boolean {
  return !!UPDATER_DIR && fs.existsSync(path.join(UPDATER_DIR, "requests"));
}

/** The commit this copy was installed from (written by scripts/install.sh). */
export function installedVersion(): CommitRef | null {
  return readJson<CommitRef>(path.join(process.cwd(), "version.json")) ?? null;
}

export function readUpdateStatus(): UpdateStatus {
  return (UPDATER_DIR && readJson<UpdateStatus>(path.join(UPDATER_DIR, "status.json"))) || {};
}

/** Ask the root updater (kroombox-monitor-updater.path) to check or install. */
export function requestUpdate(action: UpdateAction) {
  fs.writeFileSync(path.join(UPDATER_DIR, "requests", action), String(Date.now()), { mode: 0o640 });
}
