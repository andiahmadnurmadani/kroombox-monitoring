export type DiskTempLevel = "normal" | "warm" | "hot" | "unknown";

export interface DiskInfo {
  id: string;
  name: string;
  model: string;
  tempC: number | null;
  status: string | null;
  smartStatus: string | null;
}

export interface CpuLoad {
  load1: number;
  load5: number;
  load15: number;
  cores: number | null;
}

export interface MemoryInfo {
  totalMB: number;
  usedMB: number;
  usedPercent: number;
}

export interface NasStatus {
  label: string;
  reachable: boolean;
  disks: DiskInfo[];
  cpuLoad: CpuLoad | null;
  memory: MemoryInfo | null;
  uptimeSec: number | null;
  lastCheckedAt: number | null;
  error: string | null;
}
