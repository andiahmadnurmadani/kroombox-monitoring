import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Monitor, MonitorInput } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "monitors.json");
const MAX_HISTORY = 50;

type Listener = () => void;

class MonitorStore {
  private monitors: Map<string, Monitor> = new Map();
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const arr: Monitor[] = JSON.parse(raw);
        for (const m of arr) this.monitors.set(m.id, m);
      }
    } catch {
      // corrupt or missing file: start empty, next save() will recreate it
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const arr = Array.from(this.monitors.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
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
  // eslint-disable-next-line no-var
  var __monitorStore: MonitorStore | undefined;
}

export const store: MonitorStore = global.__monitorStore ?? new MonitorStore();
if (process.env.NODE_ENV !== "production") global.__monitorStore = store;
