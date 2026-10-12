"use client";

import { useEffect, useState } from "react";
import type { Monitor } from "@/lib/types";
import {
  DEFAULT_RETRIES,
  DEFAULT_RETRY_INTERVAL_SEC,
  MAX_RETRIES,
  MAX_RETRY_INTERVAL_SEC,
  MIN_RETRY_INTERVAL_SEC,
} from "@/lib/monitor-rules";

export interface MonitorFormValues {
  name: string;
  url: string;
  intervalSec: number;
  retries: number;
  retryIntervalSec: number;
}

export default function MonitorFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Monitor | null;
  onClose: () => void;
  onSubmit: (values: MonitorFormValues) => Promise<string | void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "https://");
  const [intervalSec, setIntervalSec] = useState(initial?.intervalSec ?? 60);
  const [retries, setRetries] = useState(initial?.retries ?? DEFAULT_RETRIES);
  const [retryIntervalSec, setRetryIntervalSec] = useState(initial?.retryIntervalSec ?? DEFAULT_RETRY_INTERVAL_SEC);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await onSubmit({
      name,
      url,
      intervalSec: Number(intervalSec),
      retries: Number(retries),
      retryIntervalSec: Number(retryIntervalSec),
    });
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-neutral-100">
          {initial ? "Edit Monitor" : "Add Monitor"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. KolabPanel"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              type="url"
              placeholder="https://example.com"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Heartbeat interval (seconds)
            </label>
            <input
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              required
              type="number"
              min={5}
              step={5}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              How often to check, e.g. 60 = every minute.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Retries</label>
              <input
                value={retries}
                onChange={(e) => setRetries(Number(e.target.value))}
                required
                type="number"
                min={0}
                max={MAX_RETRIES}
                step={1}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Retry interval (seconds)</label>
              <input
                value={retryIntervalSec}
                onChange={(e) => setRetryIntervalSec(Number(e.target.value))}
                required
                type="number"
                min={MIN_RETRY_INTERVAL_SEC}
                max={MAX_RETRY_INTERVAL_SEC}
                step={1}
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>
            <p className="col-span-2 -mt-1 text-[11px] text-neutral-500">
              After a failed check the monitor turns yellow (retrying) and is re-checked this many times
              before it is marked DOWN. 0 = mark DOWN right away.
            </p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : initial ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
