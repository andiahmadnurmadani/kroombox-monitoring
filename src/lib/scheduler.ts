import { store } from "./store";
import type { Monitor } from "./types";

const CHECK_TIMEOUT_MS = 10_000;
const timers = new Map<string, NodeJS.Timeout>();

async function checkOnce(monitor: Monitor) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(monitor.url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "uptime-monitor/1.0" },
    });
    const ms = Date.now() - start;
    store.recordCheck(monitor.id, {
      ok: res.status >= 200 && res.status < 400,
      ms,
      statusCode: res.status,
      error: null,
    });
  } catch (err) {
    const ms = Date.now() - start;
    store.recordCheck(monitor.id, {
      ok: false,
      ms,
      statusCode: null,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleNext(id: string) {
  const monitor = store.get(id);
  if (!monitor) return;
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    const m = store.get(id);
    if (!m) return;
    await checkOnce(m);
    scheduleNext(id);
  }, monitor.intervalSec * 1000);
  timers.set(id, t);
}

export function ensureScheduled(id: string) {
  if (timers.has(id)) return;
  const monitor = store.get(id);
  if (!monitor) return;
  // check immediately, then fall into its own interval loop
  checkOnce(monitor).finally(() => scheduleNext(id));
}

export function reschedule(id: string) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
  ensureScheduled(id);
}

export function unschedule(id: string) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
}

export function startAll() {
  for (const m of store.list()) ensureScheduled(m.id);
}
