"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Monitor } from "@/lib/types";
import type { HostKind, HostStatus } from "@/lib/host-types";
import MonitorCard from "./MonitorCard";
import MonitorFormModal, { type MonitorFormValues } from "./MonitorFormModal";
import InfraPanel from "./InfraPanel";
import HostFormModal from "./HostFormModal";

const RECONNECT_MS = 2000;
// A server/NAS must stay unreachable this long before the "down" sound plays, so a
// single dropped SSH poll doesn't beep.
const HOST_DOWN_GRACE_MS = 15_000;

interface SoundSettings {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

function isSoundActiveNow(s: SoundSettings): boolean {
  if (!s.enabled) return false;
  const [sh, sm] = s.startTime.split(":").map(Number);
  const [eh, em] = s.endTime.split(":").map(Number);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin <= endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin; // overnight window, e.g. 22:00 -> 06:00
}

export default function Dashboard({ appName }: { appName: string }) {
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [hosts, setHosts] = useState<HostStatus[]>([]);
  const [hostForm, setHostForm] = useState<{ id: string | null; kind: HostKind } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"name-asc" | "name-desc" | "default">("name-asc");

  // last-seen status per monitor id, so we can tell a down->up *transition*
  // apart from "it was already up" — undefined until the first snapshot arrives
  const prevStatusRef = useRef<Record<string, Monitor["status"]> | null>(null);
  // per host: when it was first seen unreachable, and whether "down" already sounded
  const hostDownSinceRef = useRef<Record<string, number>>({});
  const hostAlertedRef = useRef<Record<string, boolean> | null>(null);
  const soundSettingsRef = useRef<SoundSettings>({
    enabled: true,
    startTime: "00:00",
    endTime: "23:59",
  });

  useEffect(() => {
    fetch("/api/sound-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) soundSettingsRef.current = data.settings;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function playSound(src: string) {
      try {
        const audio = new Audio(src);
        // browsers block audio until the user has interacted with the page at
        // least once; that's a browser policy, not something the app controls —
        // fail silently rather than throwing an unhandled promise rejection
        audio.play().catch(() => {});
      } catch {
        // ignore — same reason as above
      }
    }

    function handleMonitorsUpdate(next: Monitor[]) {
      const prev = prevStatusRef.current;
      if (prev && isSoundActiveNow(soundSettingsRef.current)) {
        for (const m of next) {
          if (prev[m.id] === "down" && m.status === "up") {
            playSound("/branding/sound/recovery");
          } else if ((prev[m.id] === "up" || prev[m.id] === "retrying") && m.status === "down") {
            playSound("/branding/sound/down");
          }
        }
      }
      prevStatusRef.current = Object.fromEntries(next.map((m) => [m.id, m.status]));
      setMonitors(next);
      setLoaded(true);
    }

    function handleHostsUpdate(next: HostStatus[]) {
      const now = Date.now();
      const since = hostDownSinceRef.current;
      const firstSnapshot = hostAlertedRef.current === null;
      const alerted = (hostAlertedRef.current ??= {});
      const soundOn = isSoundActiveNow(soundSettingsRef.current);
      for (const h of next) {
        const down = h.enabled && !h.reachable && h.lastCheckedAt !== null;
        if (down) {
          since[h.id] ??= now;
          // already down when the page opened: show it, don't announce it
          if (firstSnapshot) alerted[h.id] = true;
          if (!alerted[h.id] && now - since[h.id] >= HOST_DOWN_GRACE_MS) {
            alerted[h.id] = true;
            if (soundOn) playSound("/branding/sound/down");
          }
        } else {
          delete since[h.id];
          if (alerted[h.id]) {
            alerted[h.id] = false;
            if (h.enabled && h.reachable && soundOn) playSound("/branding/sound/recovery");
          }
        }
      }
      setHosts(next);
    }

    function connect() {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${location.host}/ws`);

      ws.onopen = () => setLive(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "monitors") {
            handleMonitorsUpdate(msg.data ?? []);
          } else if (msg.type === "hosts") {
            handleHostsUpdate(msg.data ?? []);
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
      return data.error ?? "Failed to add monitor";
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
      return data.error ?? "Failed to save changes";
    }
    setEditing(null);
  }

  async function handleDelete(m: Monitor) {
    if (!confirm(`Delete monitor "${m.name}"?`)) return;
    await fetch(`/api/monitors/${m.id}`, { method: "DELETE" });
  }

  async function handleDeleteHost(h: HostStatus) {
    if (!confirm(`Stop monitoring ${h.kind === "nas" ? "NAS" : "server"} "${h.label}" and delete it?`)) return;
    await fetch(`/api/hosts/${encodeURIComponent(h.id)}`, { method: "DELETE" });
  }

  function openAdd(kind: "website" | HostKind) {
    setAddMenuOpen(false);
    if (kind === "website") setModalOpen(true);
    else setHostForm({ id: null, kind });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const upCount = monitors.filter((m) => m.status === "up").length;
  const downCount = monitors.filter((m) => m.status === "down").length;
  const retryingCount = monitors.filter((m) => m.status === "retrying").length;
  const pendingCount = monitors.filter((m) => m.status === "pending").length;

  const query = search.trim().toLowerCase();
  const filteredMonitors = (
    query
      ? monitors.filter(
          (m) => m.name.toLowerCase().includes(query) || m.url.toLowerCase().includes(query)
        )
      : monitors
  ).slice().sort((a, b) => {
    if (sortOrder === "name-asc") return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (sortOrder === "name-desc") return b.name.localeCompare(a.name, "en", { sensitivity: "base" });
    return 0;
  });

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-800/80 bg-neutral-950/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo" alt="" className="h-8 w-8 object-contain" />
            <h1 className="text-base font-semibold tracking-tight">{appName}</h1>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              live
                ? "bg-emerald-950/60 text-emerald-400 ring-1 ring-inset ring-emerald-800/50"
                : "bg-neutral-800/70 text-neutral-400"
            }`}
            title={live ? "Connected in real time via WebSocket" : "Disconnected, trying to reconnect..."}
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
            {retryingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-950/60 px-2.5 py-1 text-amber-300 ring-1 ring-inset ring-amber-800/50">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {retryingCount} retrying
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-neutral-800/70 px-2.5 py-1 text-neutral-400">
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-emerald-900/40 transition-colors hover:bg-emerald-500"
            >
              + Add
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAddMenuOpen(false)} />
                <div role="menu" className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                  {[
                    { kind: "website" as const, title: "Website", hint: "Periodic HTTP/HTTPS checks" },
                    { kind: "server" as const, title: "Server", hint: "Load, RAM, disk via SSH" },
                    { kind: "nas" as const, title: "NAS", hint: "SSH + Synology disk temperatures" },
                  ].map((item) => (
                    <button
                      key={item.kind}
                      role="menuitem"
                      onClick={() => openAdd(item.kind)}
                      className="block w-full px-3 py-2 text-left hover:bg-neutral-800"
                    >
                      <span className="block text-sm text-neutral-100">{item.title}</span>
                      <span className="block text-[11px] text-neutral-500">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
            title="Sign out"
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
        <InfraPanel
          hosts={hosts}
          onAdd={(kind) => openAdd(kind)}
          onEdit={(h) => setHostForm({ id: h.id, kind: h.kind })}
          onDelete={handleDeleteHost}
        />
        {loaded && monitors.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-500">
            <p className="text-sm">No websites are being monitored yet.</p>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              + Add Your First Website
            </button>
          </div>
        ) : (
          <section>
            {monitors.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Websites
                </h2>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
                  <div className="relative w-full max-w-[220px]">
                    <svg
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search websites..."
                      className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 py-1.5 pl-8 pr-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-emerald-600"
                    />
                  </div>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                    title="Sort"
                    className="rounded-lg border border-neutral-800 bg-neutral-900/60 py-1.5 pl-2.5 pr-7 text-sm text-neutral-300 outline-none focus:border-emerald-600"
                  >
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                    <option value="default">Date Added</option>
                  </select>
                </div>
              </div>
            )}
            {filteredMonitors.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">
                No websites match &quot;{search}&quot;.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
                {filteredMonitors.map((m) => (
                  <MonitorCard
                    key={m.id}
                    monitor={m}
                    onEdit={(mon) => setEditing(mon)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
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
      {hostForm && (
        <HostFormModal
          hostId={hostForm.id}
          initialKind={hostForm.kind}
          onClose={() => setHostForm(null)}
          onSaved={() => setHostForm(null)}
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
