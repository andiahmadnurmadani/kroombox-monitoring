"use client";

import { useEffect, useState } from "react";
import type { HostKind, HostView } from "@/lib/host-types";

interface TestResult {
  ssh: { ok: boolean; error: string | null; metrics: { cpuLoad: { cores: number | null }; memory: { totalMB: number } } | null };
  dsm: { ok: boolean; error: string | null; diskCount: number } | null;
}

const INPUT =
  "w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-emerald-500";
const LABEL = "mb-1 block text-xs text-neutral-400";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-lg bg-neutral-800/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            value === o.value ? "bg-neutral-950 text-neutral-100 shadow" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Add / edit a server or NAS. Stored secrets are never sent back to the browser,
 * so on edit an empty secret field means "keep the current one". */
export default function HostFormModal({
  hostId,
  initialKind,
  onClose,
  onSaved,
}: {
  hostId: string | null;
  initialKind: HostKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [existing, setExisting] = useState<HostView | null>(null);
  const [loading, setLoading] = useState(hostId !== null);
  const [kind, setKind] = useState<HostKind>(initialKind);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [intervalSec, setIntervalSec] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [dsmEnabled, setDsmEnabled] = useState(true);
  const [dsmPort, setDsmPort] = useState(5001);
  const [dsmHttps, setDsmHttps] = useState(true);
  const [dsmInterval, setDsmInterval] = useState(15);
  const [dsmSeparate, setDsmSeparate] = useState(false);
  const [dsmUser, setDsmUser] = useState("");
  const [dsmPass, setDsmPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!hostId) return;
    fetch(`/api/hosts/${encodeURIComponent(hostId)}`)
      .then((r) => r.json())
      .then((data) => {
        const h: HostView | undefined = data.host;
        if (!h) {
          setError(data.error ?? "Host tidak ditemukan");
          return;
        }
        setExisting(h);
        setKind(h.kind);
        setLabel(h.label);
        setHost(h.host);
        setPort(h.port);
        setUsername(h.username);
        setAuthMethod(h.authMethod);
        setIntervalSec(h.intervalSec);
        setEnabled(h.enabled);
        if (h.dsm) {
          setDsmEnabled(h.dsm.enabled);
          setDsmPort(h.dsm.port);
          setDsmHttps(h.dsm.https);
          setDsmInterval(h.dsm.intervalSec);
          setDsmSeparate(!!h.dsm.username);
          setDsmUser(h.dsm.username ?? "");
        } else if (h.kind === "nas") {
          setDsmEnabled(false);
        }
      })
      .catch(() => setError("Gagal memuat data host"))
      .finally(() => setLoading(false));
  }, [hostId]);

  function payload() {
    return {
      id: existing?.id,
      kind,
      label,
      host,
      port: Number(port),
      username,
      authMethod,
      password: authMethod === "password" ? password : undefined,
      privateKey: authMethod === "key" ? privateKey : undefined,
      passphrase: authMethod === "key" ? passphrase : undefined,
      intervalSec: Number(intervalSec),
      enabled,
      dsm:
        kind === "nas"
          ? {
              enabled: dsmEnabled,
              port: Number(dsmPort),
              https: dsmHttps,
              intervalSec: Number(dsmInterval),
              username: dsmSeparate ? dsmUser : "",
              password: dsmSeparate ? dsmPass : "",
            }
          : undefined,
    };
  }

  async function handleTest() {
    setError(null);
    setTest(null);
    setTesting(true);
    try {
      const res = await fetch("/api/hosts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Test gagal");
      else setTest(data);
    } catch {
      setError("Tidak bisa terhubung ke server");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(existing ? `/api/hosts/${encodeURIComponent(existing.id)}` : "/api/hosts", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal menyimpan");
        return;
      }
      onSaved();
    } catch {
      setError("Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  const keepHint = "tersimpan — kosongkan bila tidak diubah";
  const title = `${existing ? "Edit" : "Tambah"} ${kind === "nas" ? "NAS" : "Server"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
        <h2 className="border-b border-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-100">{title}</h2>
        {loading ? (
          <p className="p-4 text-sm text-neutral-500">Memuat…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <div className="space-y-3 overflow-y-auto px-4 py-3">
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "server", label: "Server (SSH)" },
                  { value: "nas", label: "NAS" },
                ]}
              />
              <div>
                <label className={LABEL}>Nama</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} placeholder="Mis. Server Produksi" className={INPUT} />
              </div>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <div>
                  <label className={LABEL}>Host / IP</label>
                  <input value={host} onChange={(e) => setHost(e.target.value)} required placeholder="192.168.1.10 atau server.lan" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Port SSH</label>
                  <input value={port} onChange={(e) => setPort(Number(e.target.value))} type="number" min={1} max={65535} required className={INPUT} />
                </div>
              </div>
              <div>
                <label className={LABEL}>Username SSH</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Autentikasi</label>
                <Segmented
                  value={authMethod}
                  onChange={setAuthMethod}
                  options={[
                    { value: "password", label: "Password" },
                    { value: "key", label: "Private key" },
                  ]}
                />
              </div>
              {authMethod === "password" ? (
                <div>
                  <label className={LABEL}>Password SSH</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    required={!existing?.hasPassword}
                    placeholder={existing?.hasPassword ? keepHint : ""}
                    className={INPUT}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className={LABEL}>Private key (OpenSSH/PEM)</label>
                    <textarea
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      required={!existing?.hasPrivateKey}
                      placeholder={existing?.hasPrivateKey ? keepHint : "-----BEGIN OPENSSH PRIVATE KEY-----"}
                      className={`${INPUT} font-mono text-xs`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Passphrase key (opsional)</label>
                    <input value={passphrase} onChange={(e) => setPassphrase(e.target.value)} type="password" autoComplete="new-password" className={INPUT} />
                  </div>
                </>
              )}
              <div>
                <label className={LABEL}>Interval cek metrik (detik)</label>
                <input value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} type="number" min={1} max={3600} required className={INPUT} />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Koneksi SSH dibuka sekali lalu dipakai ulang, jadi 1-5 detik tetap ringan.
                </p>
              </div>

              {kind === "nas" && (
                <div className="space-y-3 rounded-lg border border-neutral-800 p-3">
                  <label className="flex items-center gap-2 text-sm text-neutral-200">
                    <input type="checkbox" checked={dsmEnabled} onChange={(e) => setDsmEnabled(e.target.checked)} className="accent-emerald-500" />
                    Suhu disk dari Synology DSM
                  </label>
                  {dsmEnabled && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Port DSM</label>
                          <input value={dsmPort} onChange={(e) => setDsmPort(Number(e.target.value))} type="number" min={1} max={65535} className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Interval (detik)</label>
                          <input value={dsmInterval} onChange={(e) => setDsmInterval(Number(e.target.value))} type="number" min={10} max={3600} className={INPUT} />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-neutral-300">
                        <input type="checkbox" checked={dsmHttps} onChange={(e) => setDsmHttps(e.target.checked)} className="accent-emerald-500" />
                        HTTPS (port bawaan 5001; HTTP biasanya 5000)
                      </label>
                      <label className="flex items-center gap-2 text-xs text-neutral-300">
                        <input type="checkbox" checked={dsmSeparate} onChange={(e) => setDsmSeparate(e.target.checked)} className="accent-emerald-500" />
                        Akun DSM berbeda dari akun SSH
                      </label>
                      {dsmSeparate && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={LABEL}>Username DSM</label>
                            <input value={dsmUser} onChange={(e) => setDsmUser(e.target.value)} autoComplete="off" className={INPUT} />
                          </div>
                          <div>
                            <label className={LABEL}>Password DSM</label>
                            <input
                              value={dsmPass}
                              onChange={(e) => setDsmPass(e.target.value)}
                              type="password"
                              autoComplete="new-password"
                              placeholder={existing?.dsm?.hasPassword ? "tersimpan" : ""}
                              className={INPUT}
                            />
                          </div>
                        </div>
                      )}
                      {!dsmSeparate && authMethod === "key" && (
                        <p className="text-[11px] text-amber-300/80">
                          Login DSM butuh password: centang &quot;Akun DSM berbeda&quot; dan isi password-nya.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-emerald-500" />
                Aktif dipantau
              </label>

              {test && (
                <div className="space-y-1 rounded-lg bg-neutral-950/60 p-3 text-xs">
                  <p className={test.ssh.ok ? "text-emerald-400" : "text-red-400"}>
                    SSH:{" "}
                    {test.ssh.ok && test.ssh.metrics
                      ? `berhasil · ${test.ssh.metrics.cpuLoad.cores ?? "?"} core · RAM ${(test.ssh.metrics.memory.totalMB / 1024).toFixed(1)} GB`
                      : test.ssh.error}
                  </p>
                  {test.dsm && (
                    <p className={test.dsm.ok ? "text-emerald-400" : "text-red-400"}>
                      DSM: {test.dsm.ok ? `berhasil · ${test.dsm.diskCount} disk` : test.dsm.error}
                    </p>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-neutral-800 px-4 py-3">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
              >
                {testing ? "Menguji…" : "Test koneksi"}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {saving ? "Menyimpan…" : existing ? "Simpan" : "Tambah"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
