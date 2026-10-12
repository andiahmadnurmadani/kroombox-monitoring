import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProcMetrics } from "../src/lib/proc-metrics";
import { sniffLogo } from "../src/lib/app-settings";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "../src/lib/rate-limit";
import { describeSshError } from "../src/lib/persistent-ssh-poller";
import { nextStatus, parseRetryFields } from "../src/lib/monitor-rules";
import type { MonitorStatus } from "../src/lib/types";

test("parseProcMetrics reads /proc output", () => {
  const out = [
    "---LOAD---", "0.50 0.40 0.30 1/100 1234",
    "---CORES---", "4",
    "---MEM---", "MemTotal:       8000000 kB", "MemFree:        1000000 kB", "MemAvailable:   6000000 kB",
    "---UPTIME---", "90061.5 1000.0",
    "---DISK---", "/dev/sda1 100 42 58 42% /",
  ].join("\n");
  const m = parseProcMetrics(out);
  assert.ok(m);
  assert.equal(m?.cpuLoad.cores, 4);
  assert.equal(m?.memory.usedPercent, 25);
  assert.equal(m?.diskUsedPercent, 42);
  assert.equal(Math.round(m?.uptimeSec ?? 0), 90062);
  assert.equal(parseProcMetrics("sh: cat: not found"), null);
});

test("logo detected from magic bytes, SVG/text rejected", () => {
  assert.equal(sniffLogo(Buffer.from("89504e470d0a1a0a0000", "hex")), "png");
  assert.equal(sniffLogo(Buffer.from("ffd8ffe000104a46", "hex")), "jpg");
  assert.equal(sniffLogo(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(sniffLogo(Buffer.from("<svg onload=alert(1)>")), null);
});

test("login locked after 10 failures from the same IP", () => {
  const ip = "203.0.113.9";
  clearLoginFailures(ip);
  for (let i = 0; i < 9; i++) recordLoginFailure(ip);
  assert.equal(loginBlockedFor(ip), 0);
  recordLoginFailure(ip);
  assert.ok(loginBlockedFor(ip) > 0);
  assert.equal(loginBlockedFor("203.0.113.10"), 0);
  clearLoginFailures(ip);
  assert.equal(loginBlockedFor(ip), 0);
});

test("SSH errors are turned into actionable messages", () => {
  assert.match(describeSshError({ level: "client-authentication" }), /SSH login rejected/);
  assert.match(describeSshError({ code: "ECONNREFUSED" }), /refused/);
  assert.match(describeSshError({ level: "client-timeout" }), /Timed out/);
  assert.match(describeSshError({ code: "ENOTFOUND" }), /DNS/);
});

test("uploaded sounds detected from magic bytes", async () => {
  const { sniffSound } = await import("../src/lib/custom-sounds");
  const pad = Buffer.alloc(16);
  assert.equal(sniffSound(Buffer.concat([Buffer.from("ID3"), pad])), "mp3");
  assert.equal(sniffSound(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90]), pad])), "mp3");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE"), pad])), "wav");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("OggS"), pad])), "ogg");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("\0\0\0\x20ftypM4A "), pad])), "m4a");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("<html><script>"), pad])), null);
});

test("SSH poller does not hang when the connection closes before ready", async () => {
  const net = await import("net");
  const { PersistentSshPoller } = await import("../src/lib/persistent-ssh-poller");
  // server yang menerima TCP lalu langsung menutupnya, seperti host yang sedang reboot
  const server = net.createServer((sock) => sock.destroy());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as import("net").AddressInfo).port;
  const results: (string | null)[] = [];
  const poller = new PersistentSshPoller(
    { host: "127.0.0.1", port, username: "x", auth: { method: "password", password: "x" } },
    1000,
    "true",
    () => "ok",
    (_r, err) => results.push(err),
  );
  poller.start();
  await new Promise((r) => setTimeout(r, 3000));
  poller.stop();
  server.close();
  assert.ok(results.length >= 1, "onResult must be called instead of waiting forever");
  assert.ok(results.every((e) => typeof e === "string" && e.length > 0));
});

test("a failing website is retried before it is declared down", () => {
  const run = (retries: number, results: boolean[]) => {
    let status: MonitorStatus = "pending";
    let fails = 0;
    return results.map((ok) => {
      fails = ok ? 0 : fails + 1;
      return (status = nextStatus(status, fails, retries, ok));
    });
  };
  assert.deepEqual(run(3, [true, false, false, false, false, false]), ["up", "retrying", "retrying", "retrying", "down", "down"]);
  assert.deepEqual(run(3, [true, false, false, true]), ["up", "retrying", "retrying", "up"]);
  assert.deepEqual(run(0, [true, false]), ["up", "down"]);
  assert.deepEqual(run(2, [false, false, false, true]), ["retrying", "retrying", "down", "up"]);
  // already down: one failure after lowering retries must not flip back to retrying
  assert.equal(nextStatus("down", 1, 5, false), "down");
});

test("retry fields are validated", () => {
  assert.deepEqual(parseRetryFields({}), { ok: true, value: {} });
  assert.deepEqual(parseRetryFields({ retries: "2", retryIntervalSec: 30 }), { ok: true, value: { retries: 2, retryIntervalSec: 30 } });
  for (const bad of [{ retries: -1 }, { retries: 1.5 }, { retries: 11 }, { retryIntervalSec: 1 }, { retryIntervalSec: 99999 }, { retryIntervalSec: "x" }]) {
    assert.equal(parseRetryFields(bad).ok, false, JSON.stringify(bad));
  }
});
