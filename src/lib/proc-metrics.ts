export interface ProcMetrics {
  cpuLoad: { load1: number; load5: number; load15: number; cores: number | null };
  memory: { totalMB: number; usedMB: number; usedPercent: number };
  uptimeSec: number;
  diskUsedPercent: number | null;
}

/** One combined, read-only command: load average, core count, memory, uptime and
 * root-disk usage — cheap enough to run every second over an already-open channel. */
export const PROC_METRICS_COMMAND = [
  "echo ---LOAD---",
  "cat /proc/loadavg",
  "echo ---CORES---",
  "nproc",
  "echo ---MEM---",
  "cat /proc/meminfo",
  "echo ---UPTIME---",
  "cat /proc/uptime",
  "echo ---DISK---",
  "df -P / | tail -1",
].join(" && ");

function parseMeminfo(raw: string): ProcMetrics["memory"] | null {
  const kv: Record<string, number> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) kv[m[1]] = Number(m[2]);
  }
  const totalKB = kv.MemTotal;
  const availableKB = kv.MemAvailable ?? kv.MemFree;
  if (!totalKB || availableKB === undefined) return null;
  const usedKB = totalKB - availableKB;
  return {
    totalMB: Math.round(totalKB / 1024),
    usedMB: Math.round(usedKB / 1024),
    usedPercent: Math.round((usedKB / totalKB) * 100),
  };
}

export function parseProcMetrics(out: string): ProcMetrics | null {
  try {
    const loadSection = out.split("---LOAD---")[1]?.split("---CORES---")[0] ?? "";
    const coresSection = out.split("---CORES---")[1]?.split("---MEM---")[0] ?? "";
    const memSection = out.split("---MEM---")[1]?.split("---UPTIME---")[0] ?? "";
    const uptimeSection = out.split("---UPTIME---")[1]?.split("---DISK---")[0] ?? "";
    const diskSection = out.split("---DISK---")[1] ?? "";

    const loadParts = loadSection.trim().split(/\s+/);
    const load1 = parseFloat(loadParts[0]);
    const load5 = parseFloat(loadParts[1]);
    const load15 = parseFloat(loadParts[2]);
    const cores = parseInt(coresSection.trim(), 10);
    const memory = parseMeminfo(memSection);
    const uptimeSec = parseFloat(uptimeSection.trim().split(/\s+/)[0]);
    const diskMatch = diskSection.match(/(\d+)%/);
    const diskUsedPercent = diskMatch ? parseInt(diskMatch[1], 10) : null;

    if ([load1, load5, load15, uptimeSec].some((n) => Number.isNaN(n)) || !memory) {
      return null;
    }

    return {
      cpuLoad: { load1, load5, load15, cores: Number.isFinite(cores) && cores > 0 ? cores : null },
      memory,
      uptimeSec,
      diskUsedPercent,
    };
  } catch {
    return null;
  }
}
