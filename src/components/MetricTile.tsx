import type { ReactNode } from "react";

export default function MetricTile({
  icon,
  label,
  value,
  colorClass,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  colorClass?: string;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-neutral-950/40 py-2.5" title={title}>
      <div className={`flex items-center gap-1.5 ${colorClass ?? "text-neutral-300"}`}>
        {icon}
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  );
}
