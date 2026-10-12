"use client";

import { useEffect, useRef, useState } from "react";

/** Branding: the name in the header/login/browser tab and the logo next to it. */
export default function AppSettingsCard() {
  const [appName, setAppName] = useState("");
  const [hasCustomLogo, setHasCustomLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/app-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) setAppName(data.settings.appName);
        setHasCustomLogo(!!data.hasCustomLogo);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function flash(ok: string | null, err: string | null) {
    setSuccess(ok);
    setError(err);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    flash(null, null);
    setSaving(true);
    try {
      const res = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) flash(null, data.error ?? "Failed to save");
      else flash("App name saved.", null);
    } catch {
      flash(null, "Cannot reach the server");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    flash(null, null);
    const form = new FormData();
    form.append("logo", file);
    const res = await fetch("/api/app-settings/logo", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      flash(null, data.error ?? "Failed to upload logo");
      return;
    }
    setHasCustomLogo(true);
    setLogoVersion((v) => v + 1);
    flash("Logo updated.", null);
  }

  async function handleResetLogo() {
    flash(null, null);
    await fetch("/api/app-settings/logo", { method: "DELETE" });
    setHasCustomLogo(false);
    setLogoVersion((v) => v + 1);
    flash("Logo reset to default.", null);
  }

  return (
    <div className="mb-4 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-xl shadow-black/30">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Appearance</h2>
      <p className="mb-4 text-xs text-neutral-500">Name and logo shown on the dashboard, the login page and the browser tab.</p>
      {!loaded ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">App name</label>
            <div className="flex gap-2">
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                maxLength={40}
                required
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={saving}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/branding/logo?v=${logoVersion}`} alt="" className="h-12 w-12 rounded-lg bg-neutral-950/60 object-contain p-1" />
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800">
                Change logo
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleLogo(e.target.files?.[0])}
                />
              </label>
              {hasCustomLogo && (
                <button type="button" onClick={handleResetLogo} className="rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800">
                  Use default logo
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-neutral-500">PNG, JPG or WebP, max. 512 KB. Square images look best.</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-emerald-400">{success}</p>}
        </form>
      )}
    </div>
  );
}
