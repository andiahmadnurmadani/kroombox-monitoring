"use client";

import type { HostKind, HostStatus } from "@/lib/host-types";
import HostCard from "./HostCard";

export default function InfraPanel({
  hosts,
  onAdd,
  onEdit,
  onDelete,
}: {
  hosts: HostStatus[];
  onAdd: (kind: HostKind) => void;
  onEdit: (h: HostStatus) => void;
  onDelete: (h: HostStatus) => void;
}) {
  const down = hosts.filter((h) => h.enabled && !h.reachable && h.lastCheckedAt !== null).length;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Infrastruktur
          {hosts.length > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-neutral-600">
              {hosts.length} host{down > 0 && <span className="text-red-400"> · {down} tidak terjangkau</span>}
            </span>
          )}
        </h2>
        {hosts.length > 0 && (
          <div className="flex gap-1">
            <button onClick={() => onAdd("server")} className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
              + Server
            </button>
            <button onClick={() => onAdd("nas")} className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100">
              + NAS
            </button>
          </div>
        )}
      </div>
      {hosts.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-500">
          <span>Pantau load, RAM, disk & uptime server atau NAS lewat SSH.</span>
          <div className="flex gap-2">
            <button onClick={() => onAdd("server")} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
              + Server
            </button>
            <button onClick={() => onAdd("nas")} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
              + NAS
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
          {hosts.map((h) => (
            <div key={h.id} className={h.kind === "nas" && h.disks && h.disks.length > 2 ? "lg:col-span-2" : undefined}>
              <HostCard host={h} onEdit={onEdit} onDelete={onDelete} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
