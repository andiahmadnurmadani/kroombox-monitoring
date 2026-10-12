export type MonitorStatus = "up" | "down" | "pending" | "retrying";

export interface HeartbeatTick {
  t: number; // epoch ms
  ok: boolean;
  ms: number;
  retry?: boolean; // failed check that is still being retried (not counted as down)
}

export interface Monitor {
  id: string;
  name: string;
  url: string;
  intervalSec: number;
  retries: number; // re-checks after a failure before the monitor is declared down
  retryIntervalSec: number;
  failCount: number; // consecutive failed checks
  status: MonitorStatus;
  lastCheckedAt: number | null;
  lastResponseTimeMs: number | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: number;
  history: HeartbeatTick[];
}

export interface MonitorInput {
  name: string;
  url: string;
  intervalSec: number;
  retries?: number;
  retryIntervalSec?: number;
}
