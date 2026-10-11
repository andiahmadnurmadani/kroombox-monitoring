import { randomUUID } from "crypto";
import { dataFile, readJson, writeJson } from "./data-dir";
import type { Monitor, MonitorInput } from "./types";

const DATA_FILE = "monitors.json";
const MAX_HISTORY = 50;

type Listener = () => void;

class MonitorStore {
  private monitors: Map<string, Monitor> = new Map();
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    // corrupt or missing file: start empty, next save() will recreate it
    for (const m of readJson<Monitor[]>(dataFile(DATA_FILE)) ?? []) this.monitors.set(m.id, m);
  }

  private save() {
    try {
      writeJson(dataFile(DATA_FILE), Array.from(this.monitors.values()));
    } catch (e) {
      console.error("Failed to persist monitors.json:", e);
    }
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  list(): Monitor[] {
    return Array.from(this.monitors.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): Monitor | undefined {
    return this.monitors.get(id);
  }

  create(input: MonitorInput): Monitor {
    const m: Monitor = {
      id: randomUUID(),
      name: input.name.trim(),
      url: input.url.trim(),
      intervalSec: Math.max(5, Math.floor(input.intervalSec)),
      status: "pending",
      lastCheckedAt: null,
      lastResponseTimeMs: null,
      lastStatusCode: null,
      lastError: null,
      createdAt: Date.now(),
      history: [],
    };
    this.monitors.set(m.id, m);
    this.save();
    this.notify();
    return m;
  }

  update(id: string, patch: Partial<MonitorInput>): Monitor | undefined {
    const m = this.monitors.get(id);
    if (!m) return undefined;
    if (patch.name !== undefined) m.name = patch.name.trim();
    if (patch.url !== undefined) m.url = patch.url.trim();
    if (patch.intervalSec !== undefined) m.intervalSec = Math.max(5, Math.floor(patch.intervalSec));
    this.save();
    this.notify();
    return m;
  }

  recordCheck(id: string, result: {
    ok: boolean;
    ms: number;
    statusCode: number | null;
    error: string | null;
  }) {
    const m = this.monitors.get(id);
    if (!m) return;
    const now = Date.now();
    m.status = result.ok ? "up" : "down";
    m.lastCheckedAt = now;
    m.lastResponseTimeMs = result.ms;
    m.lastStatusCode = result.statusCode;
    m.lastError = result.error;
    m.history.push({ t: now, ok: result.ok, ms: result.ms });
    if (m.history.length > MAX_HISTORY) m.history.shift();
    this.save();
    this.notify();
  }

  remove(id: string): boolean {
    const existed = this.monitors.delete(id);
    if (existed) {
      this.save();
      this.notify();
    }
    return existed;
  }
}

declare global {
  var __monitorStore: MonitorStore | undefined;
}

// always pinned on `global`: instrumentation (which runs the checks) and the route
// handlers (which edit monitors) must share one store, not each load their own copy
export const store: MonitorStore = global.__monitorStore ?? (global.__monitorStore = new MonitorStore());
