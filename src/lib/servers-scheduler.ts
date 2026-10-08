import fs from "fs";
import path from "path";
import { PersistentSshPoller } from "./persistent-ssh-poller";
import { PROC_METRICS_COMMAND, parseProcMetrics, type ProcMetrics } from "./proc-metrics";
import { broadcast } from "./ws-broadcast";
import type { HostStatus } from "./host-types";

const DATA_FILE = path.join(process.cwd(), "data", "servers-status.json");
// SSH connections are kept open (see persistent-ssh-poller.ts), so re-running this
// one-line read is effectively free — safe to do every second, unlike reconnecting
// from scratch each tick.
const INTERVAL_MS = Math.max(1000, Number(process.env.SERVERS_INTERVAL_MS ?? "1000"));

interface ServerConfig {
  id: string;
  label: string;
  host: string;
  port?: number;
  username: string;
  password: string;
}

function loadConfigs(): ServerConfig[] {
  try {
    const parsed = JSON.parse(process.env.SERVERS_JSON ?? "[]");
    if (Array.isArray(parsed)) return parsed;
  } catch {
    console.error("SERVERS_JSON di .env.local tidak valid JSON, server monitoring dilewati");
  }
  return [];
}

interface ServersState {
  byId: Map<string, HostStatus>;
  pollers: PersistentSshPoller<ProcMetrics>[];
  started: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __serversMonitor: ServersState | undefined;
}

function loadPersisted(): Map<string, HostStatus> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const arr: HostStatus[] = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
      return new Map(arr.map((s) => [s.id, s]));
    }
  } catch {
    // ignore corrupt cache
  }
  return new Map();
}

function persist(byId: Map<string, HostStatus>) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(byId.values()), null, 2));
  } catch (e) {
    console.error("Failed to persist servers-status.json:", e);
  }
}

const state: ServersState =
  global.__serversMonitor ?? { byId: loadPersisted(), pollers: [], started: false };
if (process.env.NODE_ENV !== "production") global.__serversMonitor = state;

export function getServersStatus(): HostStatus[] {
  return Array.from(state.byId.values());
}

export function startServersMonitor() {
  if (state.started) return;
  state.started = true;

  for (const c of loadConfigs()) {
    const poller = new PersistentSshPoller(
      { host: c.host, port: c.port ?? 22, username: c.username, password: c.password },
      INTERVAL_MS,
      PROC_METRICS_COMMAND,
      parseProcMetrics,
      (metrics) => {
        state.byId.set(c.id, {
          id: c.id,
          label: c.label,
          reachable: metrics !== null,
          metrics,
          lastCheckedAt: Date.now(),
          error: metrics ? null : "Tidak terjangkau / login SSH gagal",
        });
        persist(state.byId);
        broadcast("servers", getServersStatus());
      }
    );
    poller.start();
    state.pollers.push(poller);
  }
}
