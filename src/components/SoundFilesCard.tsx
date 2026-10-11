"use client";

import { useEffect, useRef, useState } from "react";

type SoundName = "down" | "recovery";

const SLOTS: { name: SoundName; title: string; hint: string }[] = [
  { name: "down", title: "Saat down", hint: "Website tidak bisa diakses / server tidak terjangkau" },
  { name: "recovery", title: "Saat pulih (up)", hint: "Kembali normal setelah sebelumnya down" },
];

/** Upload, preview and reset the two alert sounds. */
export default function SoundFilesCard() {
  const [custom, setCustom] = useState<Record<SoundName, boolean>>({ down: false, recovery: false });
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<SoundName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/sound-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.custom) setCustom(data.custom);
      })
      .catch(() => {});
  }, []);

  function play(name: SoundName) {
    audioRef.current?.pause();
    const audio = new Audio(`/branding/sound/${name}?v=${version}`);
    audioRef.current = audio;
    audio.play().catch(() => setError("Browser menolak memutar suara"));
  }

  async function upload(name: SoundName, file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setBusy(name);
    try {
      const form = new FormData();
      form.append("sound", file);
      const res = await fetch(`/api/sound-settings/${name}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal mengunggah suara");
        return;
      }
      setCustom((c) => ({ ...c, [name]: true }));
      setVersion((v) => v + 1);
      setSuccess("Suara tersimpan. Tekan ▶ untuk mendengarkan.");
    } catch {
      setError("Tidak bisa terhubung ke server");
    } finally {
      input.value = "";
      setBusy(null);
    }
  }

  async function reset(name: SoundName) {
    setError(null);
    setSuccess(null);
    await fetch(`/api/sound-settings/${name}`, { method: "DELETE" });
    setCustom((c) => ({ ...c, [name]: false }));
    setVersion((v) => v + 1);
    setSuccess("Suara dikembalikan ke bawaan.");
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-xl shadow-black/30">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Suara Notifikasi</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Ganti suara yang berbunyi di dashboard saat website, server, atau NAS down dan saat pulih.
      </p>
      <div className="space-y-2.5">
        {SLOTS.map((slot) => (
          <div
            key={slot.name}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => play(slot.name)}
              title="Putar"
              aria-label={`Putar suara ${slot.title}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950/70 text-neutral-200 hover:bg-emerald-700"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4v16l13-8z" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-200">
                {slot.title}{" "}
                <span className="text-[11px] text-neutral-500">({custom[slot.name] ? "suara sendiri" : "bawaan"})</span>
              </p>
              <p className="truncate text-[11px] text-neutral-500">{slot.hint}</p>
            </div>
            <div className="flex gap-1.5">
              <label className="cursor-pointer rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800">
                {busy === slot.name ? "Mengunggah…" : "Unggah"}
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"
                  className="hidden"
                  disabled={busy !== null}
                  onChange={(e) => upload(slot.name, e.target.files?.[0], e.target)}
                />
              </label>
              {custom[slot.name] && (
                <button
                  type="button"
                  onClick={() => reset(slot.name)}
                  className="rounded-lg px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                >
                  Bawaan
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">MP3, WAV, OGG, atau M4A, maks. 1 MB. Suara pendek (1-3 detik) paling pas.</p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-400">{success}</p>}
    </div>
  );
}
