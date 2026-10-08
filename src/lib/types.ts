export type MonitorStatus = "up" | "down" | "pending";

export interface HeartbeatTick {
  t: number; // epoch ms
  ok: boolean;
  ms: number;
}

export interface Monitor {
  id: string;
  name: string;
  url: string;
  intervalSec: number;
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
}
