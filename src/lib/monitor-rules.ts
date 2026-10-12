import type { MonitorStatus } from "./types";

export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_INTERVAL_SEC = 20;
export const MAX_RETRIES = 10;
export const MIN_RETRY_INTERVAL_SEC = 5;
export const MAX_RETRY_INTERVAL_SEC = 3600;

/**
 * Status after one check. A failed check first puts the monitor in "retrying"; it is only
 * declared "down" once `retries` re-checks in a row have failed too (0 = down right away).
 * A monitor that is already down stays down until a check succeeds.
 */
export function nextStatus(prev: MonitorStatus, failCount: number, retries: number, ok: boolean): MonitorStatus {
  if (ok) return "up";
  if (prev === "down" || failCount > retries) return "down";
  return "retrying";
}

export interface RetryFields {
  retries?: number;
  retryIntervalSec?: number;
}

/** Validate the optional retry fields of a create/update request body. */
export function parseRetryFields(body: Record<string, unknown>): { ok: true; value: RetryFields } | { ok: false; error: string } {
  const value: RetryFields = {};
  if (body.retries !== undefined) {
    const n = Number(body.retries);
    if (!Number.isInteger(n) || n < 0 || n > MAX_RETRIES) {
      return { ok: false, error: `Retries must be a whole number from 0 to ${MAX_RETRIES}` };
    }
    value.retries = n;
  }
  if (body.retryIntervalSec !== undefined) {
    const n = Number(body.retryIntervalSec);
    if (!Number.isFinite(n) || n < MIN_RETRY_INTERVAL_SEC || n > MAX_RETRY_INTERVAL_SEC) {
      return { ok: false, error: `Retry interval must be ${MIN_RETRY_INTERVAL_SEC}-${MAX_RETRY_INTERVAL_SEC} seconds` };
    }
    value.retryIntervalSec = Math.floor(n);
  }
  return { ok: true, value };
}
