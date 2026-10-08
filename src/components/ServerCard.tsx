"use client";

import type { HostStatus } from "@/lib/host-types";
import MetricTile from "./MetricTile";
import { IconActivity, IconClock, IconCpu, IconHardDrive, IconServer } from "./icons";

function percentColor(pct: number) {
  if (pct >= 85) return "text-red-300";
  if (pct >= 70) return "text-amber-300";
  return "text-emerald-300";
}

function loadColor(load1: number, cores: number | null) {
  const ratio = load1 / (cores && cores > 0 ? cores : 4);
  if (ratio >= 1) return "text-red-300";
  if (ratio >= 0.7) return "text-amber-300";
  return "text-emerald-300";
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}j`;
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}

const ICON_CLASS = "h-3.5 w-3.5";

export default function ServerCard({ server }: { server: HostStatus }) {
  const m = server.metrics;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 pl-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20">
      <span
        className={`absolute left-0 top-0 h-full w-1 ${
          server.reachable ? "bg-emerald-500" : "bg-red-500"
        }`}
      />

      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            server.reachable
              ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]"
              : "bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.5)] animate-pulse"
          }`}
        />
        <IconServer className="h-4 w-4 text-neutral-500" />
        <h3 className="truncate text-xl font-semibold text-neutral-100">{server.label}</h3>
      </div>

      {m ? (
        <div className="grid grid-cols-2 gap-2">
          <MetricTile
            icon={<IconActivity className={ICON_CLASS} />}
            label="Load"
            value={m.cpuLoad.load1.toFixed(2)}
            colorClass={loadColor(m.cpuLoad.load1, m.cpuLoad.cores)}
            title={`1m ${m.cpuLoad.load1.toFixed(2)} · 5m ${m.cpuLoad.load5.toFixed(2)} · 15m ${m.cpuLoad.load15.toFixed(2)}${m.cpuLoad.cores ? ` (${m.cpuLoad.cores} core)` : ""}`}
          />
          <MetricTile
            icon={<IconCpu className={ICON_CLASS} />}
            label="RAM"
            value={`${m.memory.usedPercent}%`}
            colorClass={percentColor(m.memory.usedPercent)}
          />
          <MetricTile
            icon={<IconHardDrive className={ICON_CLASS} />}
            label="Disk"
            value={m.diskUsedPercent !== null ? `${m.diskUsedPercent}%` : "—"}
            colorClass={m.diskUsedPercent !== null ? percentColor(m.diskUsedPercent) : undefined}
          />
          <MetricTile
            icon={<IconClock className={ICON_CLASS} />}
            label="Uptime"
            value={formatUptime(m.uptimeSec)}
          />
        </div>
      ) : (
        <p className="truncate text-sm text-red-300/80" title={server.error ?? undefined}>
          {server.error ?? "Tidak terjangkau"}
        </p>
      )}
    </div>
  );
}
