"use client";

import type { DiskInfo, HostStatus } from "@/lib/host-types";
import CardActions from "./CardActions";
import MetricTile from "./MetricTile";
import { formatUptime, loadColor, loadTitle, percentColor } from "./format";
import { IconActivity, IconClock, IconCpu, IconHardDrive, IconServer } from "./icons";

const ICON_CLASS = "h-6 w-6";

function tempColor(tempC: number | null) {
  if (tempC === null) return "border-neutral-700 bg-neutral-950/40 text-neutral-400";
  if (tempC >= 55) return "border-red-600/50 bg-red-950/40 text-red-300";
  if (tempC >= 45) return "border-amber-500/50 bg-amber-950/30 text-amber-300";
  return "border-emerald-600/40 bg-emerald-950/20 text-emerald-300";
}

function DiskTile({ disk }: { disk: DiskInfo }) {
  return (
    <div
      className={`flex min-w-[108px] flex-1 flex-col items-center justify-center rounded-lg border px-3 py-3 transition-transform duration-200 hover:-translate-y-0.5 ${tempColor(
        disk.tempC
      )}`}
      title={`${disk.model} · SMART: ${disk.smartStatus ?? "-"}`}
    >
      <span className="truncate text-xs uppercase tracking-wide opacity-80">{disk.name}</span>
      <span className="text-3xl font-bold leading-tight tabular-nums">
        {disk.tempC !== null ? `${disk.tempC}°C` : "—"}
      </span>
    </div>
  );
}

/** One card per monitored machine: a server (SSH metrics) or a NAS (SSH metrics +
 * optional Synology DSM disk temperatures). */
export default function HostCard({
  host,
  onEdit,
  onDelete,
}: {
  host: HostStatus;
  onEdit: (h: HostStatus) => void;
  onDelete: (h: HostStatus) => void;
}) {
  const m = host.metrics;
  const isNas = host.kind === "nas";
  const paused = !host.enabled;
  const accent = paused ? "bg-neutral-600" : host.reachable ? "bg-emerald-500" : "bg-red-500";
  const dot = paused
    ? "bg-neutral-500"
    : host.reachable
      ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]"
      : "bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.5)] animate-pulse";
  const Icon = isNas ? IconHardDrive : IconServer;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 pl-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <CardActions onEdit={() => onEdit(host)} onDelete={() => onDelete(host)} />

      <div className="flex min-w-0 items-center gap-2 pr-16 sm:pr-0">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
        <h3 className="truncate text-xl font-semibold text-neutral-100">{host.label}</h3>
        {isNas && !paused && (
          <span className="truncate text-sm text-neutral-500">
            {host.reachable ? "online" : host.error ?? host.dsmError ?? "unreachable"}
          </span>
        )}
      </div>

      {paused ? (
        <p className="text-sm text-neutral-500">Monitoring paused</p>
      ) : m ? (
        <div className={`grid gap-2 ${isNas ? "grid-cols-3" : "grid-cols-2"}`}>
          <MetricTile
            icon={<IconActivity className={ICON_CLASS} />}
            label="Load"
            value={m.cpuLoad.load1.toFixed(2)}
            colorClass={loadColor(m.cpuLoad.load1, m.cpuLoad.cores)}
            title={loadTitle(m.cpuLoad)}
          />
          <MetricTile
            icon={<IconCpu className={ICON_CLASS} />}
            label="RAM"
            value={`${m.memory.usedPercent}%`}
            colorClass={percentColor(m.memory.usedPercent)}
            title={`${(m.memory.usedMB / 1024).toFixed(1)} / ${(m.memory.totalMB / 1024).toFixed(1)} GB`}
          />
          {!isNas && (
            <MetricTile
              icon={<IconHardDrive className={ICON_CLASS} />}
              label="Disk"
              value={m.diskUsedPercent !== null ? `${m.diskUsedPercent}%` : "—"}
              colorClass={m.diskUsedPercent !== null ? percentColor(m.diskUsedPercent) : undefined}
            />
          )}
          <MetricTile icon={<IconClock className={ICON_CLASS} />} label="Uptime" value={formatUptime(m.uptimeSec)} />
        </div>
      ) : (
        !isNas && (
          <p className="truncate text-sm text-red-300/80" title={host.error ?? undefined}>
            {host.error ?? (host.lastCheckedAt ? "Unreachable" : "Connecting…")}
          </p>
        )
      )}

      {!paused && host.disks && host.disks.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {host.disks.map((d) => (
            <DiskTile key={d.id} disk={d} />
          ))}
        </div>
      )}
      {!paused && host.reachable && host.dsmError && (
        <p className="truncate text-xs text-amber-300/80" title={host.dsmError}>
          Disk temperature: {host.dsmError}
        </p>
      )}
    </div>
  );
}
