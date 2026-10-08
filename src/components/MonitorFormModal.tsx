"use client";

import { useEffect, useState } from "react";
import type { Monitor } from "@/lib/types";

export interface MonitorFormValues {
  name: string;
  url: string;
  intervalSec: number;
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
    const result = await onSubmit({ name, url, intervalSec: Number(intervalSec) });
    setSaving(false);
    if (result) setError(result);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-neutral-100">
          {initial ? "Edit Monitor" : "Tambah Monitor"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Nama Web</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Mis. KolabPanel"
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
              placeholder="https://contoh.com"
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Heartbeat Interval (detik)
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
              Seberapa sering dicek, mis. 60 = tiap 1 menit.
            </p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : initial ? "Simpan" : "Tambah"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
