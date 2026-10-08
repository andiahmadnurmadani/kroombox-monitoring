import fs from "fs";
import path from "path";
import { fetchNasStatus } from "./nas-client";
import { PersistentSshPoller } from "./persistent-ssh-poller";
import { PROC_METRICS_COMMAND, parseProcMetrics, type ProcMetrics } from "./proc-metrics";
import { broadcast } from "./ws-broadcast";
import type { NasStatus } from "./nas-types";

const DATA_FILE = path.join(process.cwd(), "data", "nas-status.json");

// Disk temperature goes through DSM's web API (a real login/query/logout each time),
// and a disk's temperature is physically slow-moving — there's no benefit to polling
// it every second, only extra auth load on the NAS. Keep this one modest.
const DISK_INTERVAL_SEC = Math.max(10, Number(process.env.NAS_INTERVAL_SEC ?? "15"));

// Load/RAM/uptime come over a persistent SSH connection (connect once, re-exec a
// cheap read on the same channel), so this one can genuinely be ~1s "real-time".
const SSH_INTERVAL_MS = Math.max(1000, Number(process.env.NAS_SSH_INTERVAL_MS ?? "1000"));

interface NasMonitorState {
  current: NasStatus;
  diskTimer: NodeJS.Timeout | null;
  sshPoller: PersistentSshPoller<ProcMetrics> | null;
  started: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __nasMonitor: NasMonitorState | undefined;
}

function initialStatus(): NasStatus {
  return {
    label: process.env.NAS_LABEL ?? "NAS",
    reachable: false,
    disks: [],
    cpuLoad: null,
    memory: null,
    uptimeSec: null,
    lastCheckedAt: null,
    error: null,
  };
}

function loadPersisted(): NasStatus {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch {
    // ignore corrupt cache, fall back to initial
  }
  return initialStatus();
}

function persist(status: NasStatus) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(status, null, 2));
  } catch (e) {
    console.error("Failed to persist nas-status.json:", e);
  }
}

const state: NasMonitorState =
  global.__nasMonitor ?? {
    current: loadPersisted(),
    diskTimer: null,
    sshPoller: null,
    started: false,
  };
if (process.env.NODE_ENV !== "production") global.__nasMonitor = state;

async function diskTick() {
  const status = await fetchNasStatus();
  // merge in only the disk/reachability fields — cpuLoad/memory/uptimeSec are
  // owned by the independent (faster) SSH poller below, don't clobber them here
  state.current = {
    ...state.current,
    label: status.label,
    reachable: status.reachable,
    disks: status.disks,
    lastCheckedAt: status.lastCheckedAt,
    error: status.error,
  };
  persist(state.current);
  broadcast("nas", state.current);
  state.diskTimer = setTimeout(diskTick, DISK_INTERVAL_SEC * 1000);
}

export function getNasStatus(): NasStatus {
  return state.current;
}

export function startNasMonitor() {
  if (state.started) return;
  state.started = true;
  diskTick();

  const host = process.env.NAS_HOST ?? "";
  const user = process.env.NAS_USER ?? "";
  const pass = process.env.NAS_PASS ?? "";
  if (!host || !user || !pass) return;

  state.sshPoller = new PersistentSshPoller(
    { host, port: Number(process.env.NAS_SSH_PORT ?? "22"), username: user, password: pass },
    SSH_INTERVAL_MS,
    PROC_METRICS_COMMAND,
    parseProcMetrics,
    (metrics) => {
      state.current = {
        ...state.current,
        cpuLoad: metrics?.cpuLoad ?? null,
        memory: metrics?.memory ?? null,
        uptimeSec: metrics?.uptimeSec ?? null,
      };
      persist(state.current);
      broadcast("nas", state.current);
    }
  );
  state.sshPoller.start();
}
