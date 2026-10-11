"use client";

import type { Monitor } from "@/lib/types";
import HeartbeatBar from "./HeartbeatBar";
import CardActions from "./CardActions";

function timeAgo(ts: number | null): string {
  if (!ts) return "belum pernah dicek";
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}d lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  return `${h}j lalu`;
}

function uptimePercent(history: Monitor["history"]): number | null {
  if (history.length === 0) return null;
  const ok = history.filter((h) => h.ok).length;
  return Math.round((ok / history.length) * 100);
}

const STATUS_META = {
  up: {
    label: "UP",
    badge: "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30",
    dot: "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.55)]",
    accent: "bg-emerald-500",
  },
  down: {
    label: "DOWN",
    badge: "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/30",
    dot: "bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.55)] animate-pulse",
    accent: "bg-red-500",
  },
  pending: {
    label: "PENDING",
    badge: "bg-neutral-700/30 text-neutral-400 ring-1 ring-inset ring-neutral-600/30",
    dot: "bg-neutral-500",
    accent: "bg-neutral-600",
  },
} as const;

export default function MonitorCard({
  monitor,
  onEdit,
  onDelete,
}: {
  monitor: Monitor;
  onEdit: (m: Monitor) => void;
  onDelete: (m: Monitor) => void;
}) {
  const uptime = uptimePercent(monitor.history);
  const meta = STATUS_META[monitor.status];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 pl-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20">
      <span className={`absolute left-0 top-0 h-full w-1 ${meta.accent}`} />

      <div className="min-w-0 pr-16 sm:pr-0">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
          <h3 className="truncate text-xl font-semibold text-neutral-100">
            {monitor.name}
          </h3>
        </div>
        <a
          href={monitor.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-sm text-neutral-400 transition-colors hover:text-neutral-200"
        >
          {monitor.url}
        </a>
      </div>
      <CardActions onEdit={() => onEdit(monitor)} onDelete={() => onDelete(monitor)} />

      <div className="mt-4">
        <HeartbeatBar history={monitor.history} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${meta.badge}`}
          title={monitor.status === "down" ? monitor.lastError ?? undefined : undefined}
        >
          {meta.label}
        </span>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span title="Response time">
            {monitor.lastResponseTimeMs !== null ? `${monitor.lastResponseTimeMs}ms` : "—"}
          </span>
          {uptime !== null && <span title="Uptime">{uptime}%</span>}
          <span title="Terakhir dicek">{timeAgo(monitor.lastCheckedAt)}</span>
        </div>
      </div>
    </div>
  );
}
