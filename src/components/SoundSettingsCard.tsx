"use client";

import { useEffect, useState } from "react";

interface SoundSettings {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

const DEFAULT_SETTINGS: SoundSettings = { enabled: true, startTime: "00:00", endTime: "23:59" };

export default function SoundSettingsCard() {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sound-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/sound-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan");
        return;
      }
      setSuccess("Jadwal notifikasi suara tersimpan.");
    } catch {
      setError("Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  const isOvernight = settings.startTime > settings.endTime;

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-xl shadow-black/30">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Jadwal Notifikasi Suara</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Atur jam berapa saja suara notifikasi (website/server down atau pulih) boleh berbunyi — di luar jam
        ini otomatis dibisukan, tanpa perlu dimatikan manual tiap kali.
      </p>

      {!loaded ? (
        <p className="text-xs text-neutral-500">Memuat...</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-3.5">
          <label className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5">
            <span className="text-sm text-neutral-200">Aktifkan notifikasi suara</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
          </label>

          <div className={`grid grid-cols-2 gap-3 ${!settings.enabled ? "opacity-50" : ""}`}>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Mulai</label>
              <input
                type="time"
                value={settings.startTime}
                disabled={!settings.enabled}
                onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Selesai</label>
              <input
                type="time"
                value={settings.endTime}
                disabled={!settings.enabled}
                onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {settings.enabled && isOvernight && (
            <p className="text-[11px] text-neutral-500">
              Jam selesai lebih kecil dari jam mulai → dianggap jadwal lewat tengah malam (mis.
              22:00 → 06:00 artinya aktif malam sampai pagi).
            </p>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">{success}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        </form>
      )}
    </div>
  );
}
