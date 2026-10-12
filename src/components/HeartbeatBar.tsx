import type { HeartbeatTick } from "@/lib/types";

export default function HeartbeatBar({ history }: { history: HeartbeatTick[] }) {
  const slots = 20;
  const padded: (HeartbeatTick | null)[] = [
    ...Array(Math.max(0, slots - history.length)).fill(null),
    ...history.slice(-slots),
  ];

  return (
    <div className="flex items-end gap-1 h-8">
      {padded.map((tick, i) => (
        <div
          key={i}
          title={tick ? `${tick.ok ? "UP" : tick.retry ? "RETRYING" : "DOWN"} · ${tick.ms}ms` : undefined}
          className={`h-full flex-1 rounded-full transition-colors duration-300 ${
            tick === null
              ? "bg-neutral-800"
              : tick.ok
              ? "bg-emerald-500 hover:bg-emerald-400"
              : tick.retry
              ? "bg-amber-400 hover:bg-amber-300"
              : "bg-red-500 hover:bg-red-400"
          }`}
        />
      ))}
    </div>
  );
}
