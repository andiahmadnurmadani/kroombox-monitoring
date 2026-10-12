import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { hostsFromLegacyEnv, parseHostInput, toView } from "../src/lib/host-store";
import type { HostConfig } from "../src/lib/host-types";

const base = { kind: "server", label: "Web 1", host: "10.0.0.5", username: "ops", password: "rahasia", intervalSec: 5 };

test("valid new server → full config with defaults", () => {
  const r = parseHostInput(base);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.config.port, 22);
  assert.equal(r.config.enabled, true);
  assert.deepEqual(r.config.auth, { method: "password", password: "rahasia" });
  assert.equal(r.config.dsm, undefined);
  assert.match(r.config.id, /^h_[0-9a-f]{8}$/);
});

test("invalid input is rejected with a clear message", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...base, label: "" }, /Name/],
    [{ ...base, host: "bad host;rm" }, /host/i],
    [{ ...base, port: 70000 }, /port/i],
    [{ ...base, username: "a b" }, /username/i],
    [{ ...base, intervalSec: 0 }, /Interval/],
    [{ ...base, password: "" }, /SSH password/],
    [{ ...base, authMethod: "key", privateKey: "not a key" }, /private key/i],
    [{ ...base, kind: "router" }, /host type/],
  ];
  for (const [input, err] of cases) {
    const r = parseHostInput(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    if (!r.ok) assert.match(r.error, err);
  }
});

test("editing with empty secrets keeps the old secrets", () => {
  const first = parseHostInput({ ...base, kind: "nas", dsm: { enabled: true, username: "dsmadmin", password: "dsm-pass" } });
  assert.ok(first.ok);
  if (!first.ok) return;
  const edited = parseHostInput({ label: "Renamed", password: "", dsm: { enabled: true, username: "dsmadmin", password: "" } }, first.config);
  assert.ok(edited.ok);
  if (!edited.ok) return;
  assert.equal(edited.config.id, first.config.id);
  assert.equal(edited.config.label, "Renamed");
  assert.deepEqual(edited.config.auth, { method: "password", password: "rahasia" });
  assert.equal(edited.config.dsm?.password, "dsm-pass");
  // kembali ke "akun DSM = akun SSH": password DSM lama dibuang
  const same = parseHostInput({ dsm: { enabled: true, username: "" } }, edited.config);
  assert.ok(same.ok && same.config.dsm?.password === undefined && same.config.dsm?.username === undefined);
});

test("private key accepted, old passphrase kept when the key is unchanged", () => {
  const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
  const r = parseHostInput({ ...base, authMethod: "key", privateKey: key, passphrase: "pp" });
  assert.ok(r.ok);
  if (!r.ok) return;
  const again = parseHostInput({ authMethod: "key", privateKey: "", passphrase: "" }, r.config);
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal(again.config.auth.method, "key");
  if (again.config.auth.method === "key") assert.equal(again.config.auth.passphrase, "pp");
});

test("toView never exposes the password or private key", () => {
  const r = parseHostInput({ ...base, kind: "nas", dsm: { enabled: true, username: "u", password: "dsm-secret" } });
  assert.ok(r.ok);
  if (!r.ok) return;
  const json = JSON.stringify(toView(r.config));
  assert.ok(!json.includes("rahasia") && !json.includes("dsm-secret"));
  assert.equal(toView(r.config).hasPassword, true);
  assert.equal(toView(r.config).dsm?.hasPassword, true);
});

test("old .env.local config (NAS_* + SERVERS_JSON) is imported as-is", () => {
  const hosts = hostsFromLegacyEnv({
    NAS_HOST: "100.1.1.1",
    NAS_PORT: "5001",
    NAS_USER: "nasuser",
    NAS_PASS: "naspass",
    NAS_LABEL: "Synology",
    NAS_INTERVAL_SEC: "30",
    NAS_SSH_INTERVAL_MS: "2000",
    SERVERS_INTERVAL_MS: "1000",
    SERVERS_JSON: JSON.stringify([
      { id: "web", label: "Web", host: "100.1.1.2", username: "a", password: "b" },
      { id: "db", label: "DB", host: "100.1.1.3", port: 2222, username: "c", password: "d" },
      { id: "rusak", label: "No password", host: "100.1.1.4", username: "e" },
    ]),
  });
  assert.deepEqual(hosts.map((h) => h.id), ["nas", "web", "db"]);
  const nas = hosts[0] as HostConfig;
  assert.equal(nas.kind, "nas");
  assert.equal(nas.label, "Synology");
  assert.equal(nas.intervalSec, 2);
  assert.deepEqual(nas.dsm, { enabled: true, port: 5001, https: true, intervalSec: 30 });
  assert.equal(hosts[2].port, 2222);
  assert.equal(hosts[1].intervalSec, 1);
});

test("no old config → empty list", () => {
  assert.deepEqual(hostsFromLegacyEnv({}), []);
  assert.deepEqual(hostsFromLegacyEnv({ SERVERS_JSON: "{bukan json" }), []);
});

test("hosts.json is written with mode 0600 and triggers listeners", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "km-test-"));
  process.env.DATA_DIR = dir;
  delete global.__hostStore;
  const { hostStore } = await import("../src/lib/host-store");
  const store = hostStore();
  let calls = 0;
  store.onChange(() => calls++);
  const r = parseHostInput(base);
  assert.ok(r.ok);
  if (!r.ok) return;
  store.add(r.config);
  const file = path.join(dir, "hosts.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf-8")).hosts.length, 1);
  assert.equal(store.remove(r.config.id), true);
  assert.equal(store.remove(r.config.id), false);
  assert.equal(calls, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("stored password is not reused when the connection target changes", () => {
  const first = parseHostInput({ ...base, kind: "nas", dsm: { enabled: true, username: "dsmadmin", password: "dsm-pass" } });
  assert.ok(first.ok);
  if (!first.ok) return;
  for (const change of [{ host: "203.0.113.66" }, { port: 2222 }, { username: "lain" }]) {
    const r = parseHostInput({ ...change, password: "", dsm: { enabled: true, username: "dsmadmin", password: "" } }, first.config);
    assert.equal(r.ok, false, JSON.stringify(change));
    if (!r.ok) assert.match(r.error, /enter the SSH password again/);
  }
  // SSH password diketik ulang, tapi DSM ikut pindah host → password DSM juga wajib diketik ulang
  const moved = parseHostInput({ host: "203.0.113.66", password: "new", dsm: { enabled: true, username: "dsmadmin", password: "" } }, first.config);
  assert.equal(moved.ok, false);
  if (!moved.ok) assert.match(moved.error, /DSM password/);
  const dsmPort = parseHostInput({ password: "", dsm: { enabled: true, username: "dsmadmin", port: 5000, https: false, password: "" } }, first.config);
  assert.equal(dsmPort.ok, false);
  // tujuan sama → tetap boleh tanpa mengetik ulang
  const same = parseHostInput({ label: "New name", password: "", dsm: { enabled: true, username: "dsmadmin", password: "" } }, first.config);
  assert.ok(same.ok);
});
