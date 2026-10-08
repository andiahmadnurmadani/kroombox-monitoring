import type { ProcMetrics } from "./proc-metrics";

export type HostMetrics = ProcMetrics;

export interface HostStatus {
  id: string;
  label: string;
  reachable: boolean;
  metrics: HostMetrics | null;
  lastCheckedAt: number | null;
  error: string | null;
}
