#!/usr/bin/env node
// Kroombox Monitor updater. Runs as root, outside the (unprivileged, sandboxed) dashboard:
//
//   node scripts/updater.mjs check     fetch the git source folder and record whether an update exists
//   node scripts/updater.mjs apply     fast-forward the source folder and re-run scripts/install.sh
//   node scripts/updater.mjs worker    what systemd runs: handle a request dropped by the dashboard
//                                      into $UPDATER_DIR/requests ("apply" or "check"), else check
//
// The dashboard can only *ask* (by writing a file into the requests directory); it never gets root.
// Everything the updater writes (status.json, update.log, the lock) lives in $UPDATER_DIR, which is
// owned by root and only readable by the service user — never in the service-writable DATA_DIR, so
// a compromised dashboard cannot plant symlinks for root to follow.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = "kroombox-monitor";
const CONF_DIR = process.env.KM_CONF_DIR || `/etc/${APP}`;
const MAX_LOG_LINES = 60;

function readKeyValues(file) {
  try {
    const out = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

const conf = readKeyValues(path.join(CONF_DIR, "install.conf"));
const SRC = conf.SOURCE_DIR;
const INSTALL_DIR = conf.INSTALL_DIR || `/opt/${APP}`;
const SERVICE_USER = conf.SERVICE_USER || APP;
const UPDATER_DIR = conf.UPDATER_DIR || `/var/lib/${APP}-updater`;
const STATUS_FILE = path.join(UPDATER_DIR, "status.json");
const SPOOL_DIR = path.join(UPDATER_DIR, "requests");
const LOG_FILE = path.join(UPDATER_DIR, "update.log");
const LOCK_FILE = path.join(UPDATER_DIR, "update.lock");

/** uid/gid/home of a passwd entry, looked up by name or uid. */
function passwdEntry(match) {
  for (const line of fs.readFileSync("/etc/passwd", "utf8").split("\n")) {
    const [name, , uid, gid, , home] = line.split(":");
    if (name === match || uid === String(match)) return { name, uid: Number(uid), gid: Number(gid), home };
  }
  return null;
}

const serviceUser = passwdEntry(SERVICE_USER);
// fresh file only: never follow a symlink or reuse a file someone else created
const NEW_FILE = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;

/** Let the dashboard (service user's group) read a file the updater wrote. */
function shareWithService(fd) {
  if (serviceUser && process.getuid?.() === 0) fs.fchownSync(fd, 0, serviceUser.gid);
}

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStatus(patch) {
  const next = { ...readStatus(), ...patch };
  const tmp = `${STATUS_FILE}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  const fd = fs.openSync(tmp, NEW_FILE, 0o640);
  try {
    fs.writeSync(fd, JSON.stringify(next, null, 2));
    shareWithService(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, STATUS_FILE);
  return next;
}

// Git always runs as the owner of the source folder, so root never leaves root-owned
// files in someone's clone (and git's "dubious ownership" check stays happy).
function git(args, { timeout = 120_000 } = {}) {
  const st = fs.statSync(SRC);
  const owner = passwdEntry(st.uid);
  const asOwner = process.getuid?.() === 0 && st.uid !== 0;
  return execFileSync("git", ["-C", SRC, ...args], {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
    ...(asOwner ? { uid: st.uid, gid: st.gid } : {}),
    env: {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      HOME: (asOwner ? owner?.home : process.env.HOME) || "/",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    },
  }).trim();
}

function commitInfo(ref) {
  const [sha, date] = git(["log", "-1", "--format=%H%x09%cI", ref]).split("\t");
  return { sha, date };
}

function installedVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(INSTALL_DIR, "version.json"), "utf8"));
  } catch {
    return null;
  }
}

/** https URL of the GitHub repo behind `origin`, for a "view changes" link (null for other hosts). */
function githubUrl() {
  try {
    const url = git(["remote", "get-url", "origin"]);
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}

function upstreamRef() {
  try {
    return git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  } catch {
    return "origin/main";
  }
}

function errorText(e) {
  const stderr = e?.stderr ? String(e.stderr).trim() : "";
  return (stderr.split("\n").filter(Boolean).pop() || e?.message || String(e)).slice(0, 300);
}

function check() {
  if (!SRC || !fs.existsSync(path.join(SRC, ".git"))) {
    return writeStatus({ state: "idle", error: `Source folder (${SRC || "unknown"}) is not a git clone`, checkedAt: Date.now() });
  }
  writeStatus({ state: "checking" });
  try {
    git(["fetch", "--quiet", "origin"]);
    const ref = upstreamRef();
    const latest = commitInfo(ref);
    const installed = installedVersion();
    let behind = null;
    if (installed?.sha) {
      try {
        behind = Number(git(["rev-list", "--count", `${installed.sha}..${latest.sha}`]));
      } catch {
        behind = null; // installed commit unknown to this clone
      }
    }
    const updateAvailable = installed?.sha ? (behind === null ? installed.sha !== latest.sha : behind > 0) : true;
    return writeStatus({
      state: "idle",
      installed,
      latest,
      behind,
      updateAvailable,
      repoUrl: githubUrl(),
      checkedAt: Date.now(),
      error: null,
    });
  } catch (e) {
    return writeStatus({ state: "idle", error: `Update check failed: ${errorText(e)}`, checkedAt: Date.now() });
  }
}

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

function runInstaller() {
  return new Promise((resolve) => {
    fs.rmSync(LOG_FILE, { force: true });
    const log = fs.openSync(LOG_FILE, NEW_FILE, 0o640);
    shareWithService(log);
    let lines = [];
    let partial = "";
    let lastFlush = 0;
    const flush = (force) => {
      if (!force && Date.now() - lastFlush < 1500) return;
      lastFlush = Date.now();
      writeStatus({ log: lines.join("\n") });
    };
    const onData = (chunk) => {
      const text = chunk.toString();
      fs.writeSync(log, text);
      if (process.stdout.isTTY) process.stdout.write(text);
      const parts = (partial + stripAnsi(text)).split(/\r?\n/);
      partial = parts.pop() ?? "";
      lines = lines.concat(parts.filter((l) => l.trim())).slice(-MAX_LOG_LINES);
      flush(false);
    };
    const child = spawn("bash", [path.join(SRC, "scripts", "install.sh")], {
      cwd: SRC,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TERM: "dumb" },
    });
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => {
      if (partial.trim()) lines = lines.concat(partial).slice(-MAX_LOG_LINES);
      flush(true);
      fs.closeSync(log);
      resolve(code ?? 1);
    });
  });
}

async function apply() {
  const from = installedVersion();
  writeStatus({ state: "updating", startedAt: Date.now(), finishedAt: null, log: "", error: null });
  const fail = (error) => writeStatus({ state: "idle", error, finishedAt: Date.now(), lastUpdate: { ok: false, at: Date.now(), from: from?.sha ?? null, to: null } });
  try {
    if (!SRC || !fs.existsSync(path.join(SRC, ".git"))) return fail(`Source folder (${SRC || "unknown"}) is not a git clone`);
    git(["fetch", "--quiet", "origin"]);
    if (git(["status", "--porcelain", "--untracked-files=no"])) {
      return fail(`The source folder ${SRC} has uncommitted changes; commit or discard them, then try again`);
    }
    const ref = upstreamRef();
    const head = git(["rev-parse", "HEAD"]);
    const target = git(["rev-parse", ref]);
    const isAncestor = (a, b) => {
      try {
        git(["merge-base", "--is-ancestor", a, b]);
        return true;
      } catch {
        return false;
      }
    };
    if (head !== target) {
      if (isAncestor(head, target)) git(["merge", "--ff-only", "--quiet", ref]);
      else if (!isAncestor(target, head)) return fail(`The source folder has diverged from ${ref}; update it by hand`);
    }
  } catch (e) {
    return fail(`Could not update the source folder: ${errorText(e)}`);
  }

  const code = await runInstaller();
  if (code !== 0) return fail(`The installer failed (exit code ${code}); see the log below`);
  const to = installedVersion();
  writeStatus({ finishedAt: Date.now(), lastUpdate: { ok: true, at: Date.now(), from: from?.sha ?? null, to: to?.sha ?? null } });
  return check();
}

function takeLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, NEW_FILE, 0o600);
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
    try {
      if (pid) process.kill(pid, 0);
      return false; // another updater is running
    } catch {
      fs.rmSync(LOCK_FILE, { force: true }); // stale lock from a crashed run
      return takeLock();
    }
  }
}

/** Requests the dashboard dropped into the spool; "apply" wins over "check". */
function takeRequests() {
  let names = [];
  try {
    names = fs.readdirSync(SPOOL_DIR);
  } catch {
    return [];
  }
  // unlink only (never follows a symlink); the names are just "apply" / "check" flags
  for (const n of names) fs.rmSync(path.join(SPOOL_DIR, n), { force: true });
  return names;
}

const mode = process.argv[2] || "check";
if (!["check", "apply", "worker"].includes(mode)) {
  console.error("Usage: updater.mjs check|apply|worker");
  process.exit(2);
}
fs.mkdirSync(UPDATER_DIR, { recursive: true, mode: 0o750 });
if (!takeLock()) {
  console.error("Another update is already running.");
  process.exit(1);
}
try {
  const requests = mode === "worker" ? takeRequests() : [];
  const doApply = mode === "apply" || requests.includes("apply");
  const result = doApply ? await apply() : check();
  if (process.stdout.isTTY || mode !== "worker") {
    if (result.error) console.error(result.error);
    else if (result.updateAvailable) console.log(`Update available: ${result.installed?.sha?.slice(0, 7) ?? "?"} -> ${result.latest.sha.slice(0, 7)}`);
    else console.log(`Up to date (${result.installed?.sha?.slice(0, 7) ?? "?"})`);
  }
  process.exitCode = result.error ? 1 : 0;
} finally {
  fs.rmSync(LOCK_FILE, { force: true });
}
