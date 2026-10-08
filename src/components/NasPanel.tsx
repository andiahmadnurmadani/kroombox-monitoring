"use client";

import type { DiskInfo, NasStatus } from "@/lib/nas-types";
import MetricTile from "./MetricTile";
import { IconActivity, IconClock, IconCpu, IconHardDrive } from "./icons";

function loadRatio(value: number, cores: number | null): number {
  // normalize against core count, like the classic "load / nproc" rule of thumb;
  // fall back to a 4-core assumption when we don't know the real count
  return value / (cores && cores > 0 ? cores : 4);
}

function levelColor(ratio: number) {
  if (ratio >= 1) return "text-red-300";
  if (ratio >= 0.7) return "text-amber-300";
  return "text-emerald-300";
}

function percentColor(pct: number) {
  if (pct >= 85) return "text-red-300";
  if (pct >= 70) return "text-amber-300";
  return "text-emerald-300";
}

function tempColor(tempC: number | null) {
  if (tempC === null) return "border-neutral-700 bg-neutral-950/40 text-neutral-400";
  if (tempC >= 55) return "border-red-600/50 bg-red-950/40 text-red-300";
  if (tempC >= 45) return "border-amber-500/50 bg-amber-950/30 text-amber-300";
  return "border-emerald-600/40 bg-emerald-950/20 text-emerald-300";
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}j`;
  if (hours > 0) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}

function DiskTile({ disk }: { disk: DiskInfo }) {
  return (
    <div
      className={`flex min-w-[88px] flex-1 flex-col items-center justify-center rounded-lg border px-2.5 py-2 transition-transform duration-200 hover:-translate-y-0.5 ${tempColor(
        disk.tempC
      )}`}
      title={`${disk.model} · SMART: ${disk.smartStatus ?? "-"}`}
    >
      <span className="truncate text-[10px] uppercase tracking-wide opacity-80">{disk.name}</span>
      <span className="text-base font-semibold leading-tight tabular-nums">
        {disk.tempC !== null ? `${disk.tempC}°C` : "—"}
      </span>
    </div>
  );
}

const ICON_CLASS = "h-3.5 w-3.5";

export default function NasPanel({ nas }: { nas: NasStatus | null }) {
  if (!nas) return null;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 pl-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20">
      <span
        className={`absolute left-0 top-0 h-full w-1 ${
          nas.reachable ? "bg-emerald-500" : "bg-red-500"
        }`}
      />

      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            nas.reachable
              ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]"
              : "bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.5)] animate-pulse"
          }`}
        />
        <IconHardDrive className="h-4 w-4 text-neutral-500" />
        <h3 className="truncate text-xl font-semibold text-neutral-100">{nas.label}</h3>
        <span className="truncate text-xs text-neutral-500">
          {nas.reachable ? "online" : nas.error ?? "tidak terjangkau"}
        </span>
      </div>

      {nas.reachable && nas.cpuLoad && nas.memory && (
        <div className="grid grid-cols-3 gap-2">
          <MetricTile
            icon={<IconActivity className={ICON_CLASS} />}
            label="Load"
            value={nas.cpuLoad.load1.toFixed(2)}
            colorClass={levelColor(loadRatio(nas.cpuLoad.load1, nas.cpuLoad.cores))}
            title={`1m ${nas.cpuLoad.load1.toFixed(2)} · 5m ${nas.cpuLoad.load5.toFixed(2)} · 15m ${nas.cpuLoad.load15.toFixed(2)}${nas.cpuLoad.cores ? ` (${nas.cpuLoad.cores} core)` : ""}`}
          />
          <MetricTile
            icon={<IconCpu className={ICON_CLASS} />}
            label="RAM"
            value={`${nas.memory.usedPercent}%`}
            colorClass={percentColor(nas.memory.usedPercent)}
            title={`${(nas.memory.usedMB / 1024).toFixed(1)} / ${(nas.memory.totalMB / 1024).toFixed(1)} GB`}
          />
          <MetricTile
            icon={<IconClock className={ICON_CLASS} />}
            label="Uptime"
            value={nas.uptimeSec !== null ? formatUptime(nas.uptimeSec) : "—"}
          />
        </div>
      )}

      {nas.reachable && nas.disks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {nas.disks.map((d) => (
            <DiskTile key={d.id} disk={d} />
          ))}
        </div>
      )}
    </div>
  );
}
