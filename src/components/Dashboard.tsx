"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Monitor } from "@/lib/types";
import type { NasStatus } from "@/lib/nas-types";
import type { HostStatus } from "@/lib/host-types";
import MonitorCard from "./MonitorCard";
import MonitorFormModal, { type MonitorFormValues } from "./MonitorFormModal";
import ServersPanel from "./ServersPanel";

const RECONNECT_MS = 2000;

export default function Dashboard() {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [nas, setNas] = useState<NasStatus | null>(null);
  const [servers, setServers] = useState<HostStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Monitor | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${location.host}/ws`);

      ws.onopen = () => setLive(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "monitors") {
            setMonitors(msg.data ?? []);
            setLoaded(true);
          } else if (msg.type === "nas") {
            setNas(msg.data ?? null);
          } else if (msg.type === "servers") {
            setServers(msg.data ?? []);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = (event) => {
        setLive(false);
        if (stopped) return;
        if (event.code === 4001) {
          // server closes with this code right after accepting the handshake
          // when the session cookie is missing/expired
          router.replace("/login");
          return;
        }
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [router]);

  async function handleCreate(values: MonitorFormValues) {
    const res = await fetch("/api/monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error ?? "Gagal menambah monitor";
    }
    setModalOpen(false);
    // no manual refresh needed: the server pushes the updated list over the
    // websocket to every client (this tab included) right after it saves
  }

  async function handleUpdate(values: MonitorFormValues) {
    if (!editing) return;
    const res = await fetch(`/api/monitors/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error ?? "Gagal menyimpan perubahan";
    }
    setEditing(null);
  }

  async function handleDelete(m: Monitor) {
    if (!confirm(`Hapus monitor "${m.name}"?`)) return;
    await fetch(`/api/monitors/${m.id}`, { method: "DELETE" });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;
  const pendingCount = monitors.filter((m) => m.status === "pending").length;

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-800/80 bg-neutral-950/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h4l3 8 4-16 3 8h4" />
              </svg>
            </span>
            <h1 className="text-base font-semibold tracking-tight">Uptime Monitor</h1>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              live
                ? "bg-emerald-950/60 text-emerald-400 ring-1 ring-inset ring-emerald-800/50"
                : "bg-neutral-800/70 text-neutral-400"
            }`}
            title={live ? "Terhubung real-time via WebSocket" : "Terputus, mencoba menyambung ulang..."}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"
              }`}
            />
            {live ? "Live" : "Reconnecting…"}
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 text-emerald-400 ring-1 ring-inset ring-emerald-800/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {upCount} up
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-red-950/60 px-2.5 py-1 text-red-400 ring-1 ring-inset ring-red-800/50">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> {downCount} down
            </span>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-neutral-800/70 px-2.5 py-1 text-neutral-400">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-emerald-900/40 transition-colors hover:bg-emerald-500"
          >
            + Tambah Monitor
          </button>
          <Link
            href="/settings"
            title="Settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </Link>
          <button
            onClick={handleLogout}
            title="Keluar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-950/60 hover:text-red-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-auto p-4">
        <ServersPanel servers={servers} nas={nas} />
        {loaded && monitors.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-500">
            <p className="text-sm">Belum ada web yang dimonitor.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              + Tambah Monitor Pertama
            </button>
          </div>
        ) : (
          <section>
            {monitors.length > 0 && (
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Website
              </h2>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {monitors.map((m) => (
                <MonitorCard
                  key={m.id}
                  monitor={m}
                  onEdit={(mon) => setEditing(mon)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {modalOpen && (
        <MonitorFormModal
          initial={null}
          onClose={() => setModalOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <MonitorFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
