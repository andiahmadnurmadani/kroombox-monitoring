import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UPDATER = path.resolve("scripts/updater.mjs");

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** origin (bare) ← work clone that publishes commits; src = the "source folder" the updater pulls into. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "km-updater-"));
  const dirs = { conf: path.join(root, "conf"), data: path.join(root, "data"), install: path.join(root, "opt"), origin: path.join(root, "origin.git"), work: path.join(root, "work"), src: path.join(root, "src") };
  for (const d of [dirs.conf, dirs.data, dirs.install, path.join(dirs.data, "update-requests")]) fs.mkdirSync(d, { recursive: true });
  git(root, "init", "-q", "--bare", "-b", "main", dirs.origin);
  git(root, "clone", "-q", dirs.origin, dirs.work);
  git(dirs.work, "checkout", "-q", "-b", "main");
  const installer = (body: string) => {
    fs.mkdirSync(path.join(dirs.work, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(dirs.work, "scripts", "install.sh"), `#!/usr/bin/env bash\n${body}\n`);
  };
  const publish = (msg: string) => {
    git(dirs.work, "add", "-A");
    git(dirs.work, "commit", "-qm", msg);
    git(dirs.work, "push", "-q", "origin", "main");
    return git(dirs.work, "rev-parse", "HEAD");
  };
  // the fake installer records which commit it installed, like the real one does
  installer(`echo installing; git -C "$(dirname "$0")/.." log -1 --format='{"sha":"%H","date":"%cI"}' > "${dirs.install}/version.json"`);
  const first = publish("first");
  git(root, "clone", "-q", dirs.origin, dirs.src);
  fs.writeFileSync(path.join(dirs.install, "version.json"), JSON.stringify({ sha: first, date: "2026-01-01T00:00:00Z" }));
  fs.writeFileSync(path.join(dirs.conf, "kroombox-monitor.env"), `DATA_DIR=${dirs.data}\n`);
  fs.writeFileSync(path.join(dirs.conf, "install.conf"), `SOURCE_DIR=${dirs.src}\nINSTALL_DIR=${dirs.install}\nSERVICE_USER=nobody-km-test\n`);
  const run = (mode: string) => {
    try {
      execFileSync(process.execPath, [UPDATER, mode], { env: { ...process.env, KM_CONF_DIR: dirs.conf }, stdio: "pipe" });
    } catch {
      // failures are reported through the status file
    }
    return JSON.parse(fs.readFileSync(path.join(dirs.data, "update-status.json"), "utf8"));
  };
  return { root, dirs, installer, publish, first, run };
}

test("updater: check finds a new commit, a dashboard request installs it", () => {
  const t = setup();
  try {
    assert.equal(t.run("check").updateAvailable, false);
    fs.writeFileSync(path.join(t.dirs.work, "NEWS"), "v2");
    const second = t.publish("second");
    const checked = t.run("check");
    assert.equal(checked.updateAvailable, true);
    assert.equal(checked.behind, 1);
    assert.equal(checked.latest.sha, second);

    fs.writeFileSync(path.join(t.dirs.data, "update-requests", "apply"), "1");
    const done = t.run("worker");
    assert.deepEqual(fs.readdirSync(path.join(t.dirs.data, "update-requests")), []);
    assert.equal(done.error, null);
    assert.equal(done.updateAvailable, false);
    assert.equal(done.installed.sha, second);
    assert.deepEqual([done.lastUpdate.ok, done.lastUpdate.from, done.lastUpdate.to], [true, t.first, second]);
    assert.match(done.log, /installing/);
    assert.equal(git(t.dirs.src, "rev-parse", "HEAD"), second);
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true });
  }
});

test("updater: refuses a dirty source folder and reports a failing installer", () => {
  const t = setup();
  try {
    t.installer("echo boom; exit 3");
    t.publish("broken installer");
    fs.appendFileSync(path.join(t.dirs.src, "scripts", "install.sh"), "# local edit\n");
    const dirty = t.run("apply");
    assert.match(dirty.error, /uncommitted changes/);
    assert.equal(dirty.lastUpdate.ok, false);

    git(t.dirs.src, "checkout", "-q", "--", ".");
    const failed = t.run("apply");
    assert.match(failed.error, /exit code 3/);
    assert.equal(failed.lastUpdate.ok, false);
    assert.match(failed.log, /boom/);
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true });
  }
});
