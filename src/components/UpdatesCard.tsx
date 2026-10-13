"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitRef, UpdateStatus } from "@/lib/updates";
import { timeAgo } from "./format";

interface UpdateInfo {
  supported: boolean;
  running: CommitRef | null;
  status: UpdateStatus;
}

const short = (sha?: string | null) => (sha ? sha.slice(0, 7) : "unknown");
const day = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function UpdatesCard() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [requested, setRequested] = useState<"check" | "apply" | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const loadedVersion = useRef<string | null | undefined>(undefined);
  const requestedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/update", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data: UpdateInfo = await res.json();
      setRestarting(false);
      if (loadedVersion.current === undefined) loadedVersion.current = data.running?.sha ?? null;
      // the dashboard came back on a new version: reload so the browser runs the new code too
      if (data.status.state === "idle" && data.running?.sha && data.running.sha !== loadedVersion.current) {
        setTimeout(() => window.location.reload(), 1500);
      }
      setInfo(data);
      // the updater picked the request up (or already finished it)
      const s = data.status;
      if (requested && ((s.state && s.state !== "idle") || (s.startedAt ?? 0) >= requestedAt.current || (requested === "check" && (s.checkedAt ?? 0) >= requestedAt.current))) {
        setRequested(null);
      } else if (requested && Date.now() - requestedAt.current > 60_000) {
        setRequested(null);
        setError("The updater did not respond. Check it with: systemctl status kroombox-monitor-updater.path");
      }
    } catch {
      // while an update is installing, the dashboard restarts and is briefly unreachable
      if (info?.status.state === "updating" || requested === "apply") setRestarting(true);
    }
  }, [info?.status.state, requested]);

  const st = info?.status;
  const busy = requested !== null || st?.state === "checking" || st?.state === "updating" || restarting;

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function send(action: "check" | "apply") {
    if (action === "apply" && !confirm("Install the update now? The dashboard restarts and is unavailable for a minute or two.")) return;
    setError(null);
    requestedAt.current = Date.now();
    setRequested(action);
    try {
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Request failed");
        setRequested(null);
      }
    } catch {
      setError("Cannot reach the server");
      setRequested(null);
    }
  }

  const updating = st?.state === "updating" || requested === "apply" || restarting;
  const checking = !updating && (st?.state === "checking" || requested === "check");
  const compareUrl =
    st?.repoUrl && st.installed?.sha && st.latest?.sha ? `${st.repoUrl}/compare/${st.installed.sha}...${st.latest.sha}` : null;
  const failedUpdate = st?.lastUpdate && !st.lastUpdate.ok && st.state === "idle";

  return (
    <div id="updates" className="mt-4 scroll-mt-6 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-6 shadow-xl shadow-black/30">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Updates</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Install new versions from GitHub with one click. Monitors, servers and settings are kept.
      </p>
      {!info ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-400">
            Installed version{" "}
            <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">{short(info.running?.sha)}</code>
            {info.running?.date && <span className="text-neutral-500"> · {day(info.running.date)}</span>}
          </p>

          {!info.supported ? (
            <p className="text-[11px] text-neutral-500">
              One-click updates are available when the dashboard is installed as a service with{" "}
              <code className="text-neutral-400">sudo ./scripts/install.sh</code>.
            </p>
          ) : updating ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="flex items-center gap-2 text-sm text-amber-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                {restarting ? "Restarting the dashboard…" : "Installing the update…"}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                This takes a few minutes. The page reloads by itself when the new version is running.
              </p>
              {st?.log && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[10px] leading-4 text-neutral-400">
                  {st.log.split("\n").slice(-12).join("\n")}
                </pre>
              )}
            </div>
          ) : st?.updateAvailable && st.latest ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm text-emerald-300">
                Update available
                {typeof st.behind === "number" && st.behind > 0 && (
                  <span className="text-emerald-400/80">
                    {" "}
                    · {st.behind} new {st.behind === 1 ? "change" : "changes"}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">
                {short(st.installed?.sha)} → {short(st.latest.sha)} · released {day(st.latest.date)}
                {compareUrl && (
                  <>
                    {" · "}
                    <a href={compareUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                      View changes
                    </a>
                  </>
                )}
              </p>
              <button
                onClick={() => send("apply")}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Update now
              </button>
            </div>
          ) : (
            st?.checkedAt &&
            !st.error && (
              <p className="text-xs text-emerald-400">
                You&apos;re up to date. <span className="text-neutral-500">Last checked {timeAgo(st.checkedAt)}.</span>
              </p>
            )
          )}

          {info.supported && !updating && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => send("check")}
                disabled={checking}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check for updates"}
              </button>
              {st?.lastUpdate?.ok && st.lastUpdate.to && (
                <span className="text-[11px] text-neutral-500">
                  Last update {timeAgo(st.lastUpdate.at)} ({short(st.lastUpdate.from)} → {short(st.lastUpdate.to)})
                </span>
              )}
            </div>
          )}

          {(error || (st?.error && !updating)) && <p className="text-xs text-red-400">{error ?? st?.error}</p>}
          {failedUpdate && st?.log && (
            <div>
              <button onClick={() => setShowLog((v) => !v)} className="text-[11px] text-neutral-400 hover:text-neutral-200">
                {showLog ? "Hide installer log" : "Show installer log"}
              </button>
              {showLog && (
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-neutral-950/70 p-2 text-[10px] leading-4 text-neutral-400">
                  {st.log}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
