export function percentColor(pct: number) {
  if (pct >= 85) return "text-red-300";
  if (pct >= 70) return "text-amber-300";
  return "text-emerald-300";
}

/** Load average judged against core count (the classic "load / nproc" rule of
 * thumb); assumes 4 cores when the host didn't report its count. */
export function loadColor(load1: number, cores: number | null) {
  const ratio = load1 / (cores && cores > 0 ? cores : 4);
  if (ratio >= 1) return "text-red-300";
  if (ratio >= 0.7) return "text-amber-300";
  return "text-emerald-300";
}

export function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function loadTitle(l: { load1: number; load5: number; load15: number; cores: number | null }) {
  return `1m ${l.load1.toFixed(2)} · 5m ${l.load5.toFixed(2)} · 15m ${l.load15.toFixed(2)}${l.cores ? ` (${l.cores} ${l.cores === 1 ? "core" : "cores"})` : ""}`;
}

/** "5s ago", "3m ago", "2h ago", "4d ago". */
export function timeAgo(ts: number): string {
  const s = Math.floor(Math.max(0, Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
