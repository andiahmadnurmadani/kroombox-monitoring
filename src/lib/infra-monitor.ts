import { dataFile, readJson, writeJson } from "./data-dir";
import { fetchDsmDisks, type DsmTarget } from "./dsm-client";
import { hostStore } from "./host-store";
import type { HostConfig, HostStatus } from "./host-types";
import { PersistentSshPoller } from "./persistent-ssh-poller";
import { PROC_METRICS_COMMAND, parseProcMetrics, type ProcMetrics } from "./proc-metrics";
import { broadcast } from "./ws-broadcast";

const STATUS_FILE = "hosts-status.json";
// Status is only cached so the dashboard has something to show right after a
// restart; with dozens of hosts polled every second, writing it on every tick
// would be pure disk churn.
const PERSIST_EVERY_MS = 15_000;
// Many hosts answering within the same instant → one WebSocket frame, not N.
const BROADCAST_COALESCE_MS = 200;

export function dsmTarget(c: HostConfig): DsmTarget | null {
  if (c.kind !== "nas" || !c.dsm?.enabled) return null;
  const username = c.dsm.username || c.username;
  const password = c.dsm.username ? c.dsm.password ?? "" : c.auth.method === "password" ? c.auth.password : "";
  if (!password) return null;
  return { host: c.host, port: c.dsm.port, https: c.dsm.https, username, password };
}

/** Polling-relevant part of a config: when it changes the connection is rebuilt;
 * a pure rename only relabels the existing status. */
function signature(c: HostConfig): string {
  return JSON.stringify([c.kind, c.host, c.port, c.username, c.auth, c.intervalSec, c.enabled, c.dsm]);
}

function emptyStatus(c: HostConfig, previous?: HostStatus): HostStatus {
  return {
    id: c.id,
    kind: c.kind,
    label: c.label,
    enabled: c.enabled,
    reachable: previous?.reachable ?? false,
    metrics: previous?.metrics ?? null,
    disks: dsmTarget(c) ? previous?.disks ?? [] : null,
    error: c.enabled ? previous?.error ?? null : null,
    dsmError: null,
    lastCheckedAt: previous?.lastCheckedAt ?? null,
  };
}

class HostRunner {
  private poller: PersistentSshPoller<ProcMetrics> | null = null;
  private dsmTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private sshOk = false;
  private dsmOk = false;
  readonly sig: string;

  constructor(
    private config: HostConfig,
    public status: HostStatus,
    private onUpdate: () => void
  ) {
    this.sig = signature(config);
  }

  relabel(label: string) {
    this.config = { ...this.config, label };
    this.status = { ...this.status, label };
  }

  start() {
    if (!this.config.enabled) return;
    this.poller = new PersistentSshPoller(
      { host: this.config.host, port: this.config.port, username: this.config.username, auth: this.config.auth },
      this.config.intervalSec * 1000,
      PROC_METRICS_COMMAND,
      parseProcMetrics,
      (metrics, error) => {
        this.sshOk = metrics !== null;
        this.status = {
          ...this.status,
          metrics,
          error,
          reachable: this.sshOk || this.dsmOk,
          lastCheckedAt: Date.now(),
        };
        this.onUpdate();
      }
    );
    this.poller.start();
    if (dsmTarget(this.config)) this.dsmTick();
  }

  private async dsmTick() {
    const target = dsmTarget(this.config);
    if (this.stopped || !target) return;
    const { disks, error } = await fetchDsmDisks(target);
    if (this.stopped) return;
    this.dsmOk = disks !== null;
    this.status = {
      ...this.status,
      disks: disks ?? [],
      dsmError: error,
      reachable: this.sshOk || this.dsmOk,
      lastCheckedAt: Date.now(),
    };
    this.onUpdate();
    this.dsmTimer = setTimeout(() => this.dsmTick(), (this.config.dsm?.intervalSec ?? 15) * 1000);
  }

  stop() {
    this.stopped = true;
    this.poller?.stop();
    if (this.dsmTimer) clearTimeout(this.dsmTimer);
  }
}

class InfraMonitor {
  private runners = new Map<string, HostRunner>();
  private order: string[] = [];
  private broadcastTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    const cached = readJson<HostStatus[]>(dataFile(STATUS_FILE)) ?? [];
    const previous = new Map(cached.map((s) => [s.id, s]));
    this.sync(previous);
    hostStore().onChange(() => this.sync());
    const persistTimer = setInterval(() => this.persist(), PERSIST_EVERY_MS);
    persistTimer.unref();
  }

  /** Reconciles running pollers with the stored host list (add / change / remove). */
  sync(previous?: Map<string, HostStatus>) {
    const configs = hostStore().list();
    const wanted = new Set(configs.map((c) => c.id));
    for (const [id, runner] of this.runners) {
      if (!wanted.has(id)) {
        runner.stop();
        this.runners.delete(id);
      }
    }
    for (const c of configs) {
      const current = this.runners.get(c.id);
      if (current && current.sig === signature(c)) {
        if (current.status.label !== c.label) current.relabel(c.label);
        continue;
      }
      current?.stop();
      const runner = new HostRunner(c, emptyStatus(c, current?.status ?? previous?.get(c.id)), () => this.changed());
      this.runners.set(c.id, runner);
      runner.start();
    }
    this.order = configs.map((c) => c.id);
    this.changed();
  }

  list(): HostStatus[] {
    return this.order.map((id) => this.runners.get(id)?.status).filter((s): s is HostStatus => !!s);
  }

  private changed() {
    this.dirty = true;
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      broadcast("hosts", this.list());
    }, BROADCAST_COALESCE_MS);
  }

  private persist() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      writeJson(dataFile(STATUS_FILE), this.list());
    } catch (e) {
      console.error("Failed to persist hosts-status.json:", e);
    }
  }
}

declare global {
  var __infraMonitor: InfraMonitor | undefined;
}

export function infraMonitor(): InfraMonitor {
  if (!global.__infraMonitor) global.__infraMonitor = new InfraMonitor();
  return global.__infraMonitor;
}
