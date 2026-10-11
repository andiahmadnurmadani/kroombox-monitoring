"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ appName }: { appName: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal masuk");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Tidak bisa terhubung ke server");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-7 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo" alt="" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-sm font-semibold text-neutral-100">{appName}</h1>
            <p className="text-xs text-neutral-500">Masuk untuk lanjut ke dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors focus:border-emerald-500"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Memeriksa..." : "Masuk"}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-neutral-600">
          Lupa password? Jalankan <code className="text-neutral-500">npm run passwd</code> di server.
        </p>
      </div>
    </div>
  );
}
