"use client";

import { useState } from "react";
import Link from "next/link";

export default function SettingsForm({ currentUsername }: { currentUsername: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState(currentUsername);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newUsername: newUsername !== currentUsername ? newUsername : undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan perubahan");
        return;
      }
      setSuccess("Tersimpan. Kredensial login sudah diperbarui.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-base font-semibold text-neutral-100">Settings</h1>
          <Link
            href="/"
            className="text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          >
            ← Kembali ke dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-xl shadow-black/30">
          <h2 className="mb-1 text-sm font-semibold text-neutral-100">Akun Login</h2>
          <p className="mb-4 text-xs text-neutral-500">
            Ubah username dan/atau password untuk masuk ke dashboard ini.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">Username</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Password Baru <span className="text-neutral-600">(kosongkan jika tidak diganti)</span>
              </label>
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>
            {newPassword && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-400">
                  Konfirmasi Password Baru
                </label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
                />
              </div>
            )}
            <div className="border-t border-neutral-800 pt-3.5">
              <label className="mb-1 block text-xs font-medium text-neutral-400">
                Password Saat Ini <span className="text-neutral-600">(wajib, untuk konfirmasi)</span>
              </label>
              <input
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                type="password"
                required
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-emerald-400">{success}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </form>
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-800/60 bg-neutral-900/40 p-4 text-xs text-neutral-500">
          <p className="font-medium text-neutral-400">Konfigurasi NAS &amp; interval</p>
          <p className="mt-1">
            Host, kredensial NAS, dan interval polling diatur lewat file{" "}
            <code className="rounded bg-neutral-800 px-1 py-0.5 text-neutral-300">.env.local</code>{" "}
            di server (bukan di sini), supaya kredensial infra tidak tersimpan dalam data yang bisa diubah lewat UI.
          </p>
        </div>
      </div>
    </div>
  );
}
