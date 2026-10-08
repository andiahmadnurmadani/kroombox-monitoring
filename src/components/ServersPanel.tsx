"use client";

import type { HostStatus } from "@/lib/host-types";
import type { NasStatus } from "@/lib/nas-types";
import ServerCard from "./ServerCard";
import NasPanel from "./NasPanel";

export default function ServersPanel({
  servers,
  nas,
}: {
  servers: HostStatus[];
  nas: NasStatus | null;
}) {
  if (servers.length === 0 && !nas) return null;

  return (
    <section className="mb-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Infrastruktur
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {nas && (
          <div className="sm:col-span-2">
            <NasPanel nas={nas} />
          </div>
        )}
        {servers.map((s) => (
          <ServerCard key={s.id} server={s} />
        ))}
      </div>
    </section>
  );
}
