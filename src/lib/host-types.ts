import type { ProcMetrics } from "./proc-metrics";

/** "server": any Linux box reachable over SSH (load, RAM, disk, uptime).
 * "nas": same SSH metrics, plus optional per-disk temperature from a Synology DSM. */
export type HostKind = "server" | "nas";

export type SshAuth =
  | { method: "password"; password: string }
  | { method: "key"; privateKey: string; passphrase?: string };

export interface DsmConfig {
  enabled: boolean;
  port: number;
  https: boolean;
  intervalSec: number;
  /** Empty means "reuse the SSH username/password" (the usual Synology setup). */
  username?: string;
  password?: string;
}

/** Stored in data/hosts.json (mode 0600). Never sent to the browser as-is: see HostView. */
export interface HostConfig {
  id: string;
  kind: HostKind;
  label: string;
  host: string;
  port: number;
  username: string;
  auth: SshAuth;
  intervalSec: number;
  enabled: boolean;
  createdAt: number;
  dsm?: DsmConfig;
}

/** What the API returns: the config with every secret replaced by a "is set" flag. */
export interface HostView {
  id: string;
  kind: HostKind;
  label: string;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuth["method"];
  hasPassword: boolean;
  hasPrivateKey: boolean;
  intervalSec: number;
  enabled: boolean;
  createdAt: number;
  dsm?: Omit<DsmConfig, "password"> & { hasPassword: boolean };
}

export type DiskTempLevel = "normal" | "warm" | "hot" | "unknown";

export interface DiskInfo {
  id: string;
  name: string;
  model: string;
  tempC: number | null;
  status: string | null;
  smartStatus: string | null;
}

export interface HostStatus {
  id: string;
  kind: HostKind;
  label: string;
  enabled: boolean;
  /** SSH metrics arrived (or, for a NAS without SSH metrics, DSM answered). */
  reachable: boolean;
  metrics: ProcMetrics | null;
  /** null when DSM is not configured for this host. */
  disks: DiskInfo[] | null;
  error: string | null;
  dsmError: string | null;
  lastCheckedAt: number | null;
}
