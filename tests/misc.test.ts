import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProcMetrics } from "../src/lib/proc-metrics";
import { sniffLogo } from "../src/lib/app-settings";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "../src/lib/rate-limit";
import { describeSshError } from "../src/lib/persistent-ssh-poller";

test("parseProcMetrics membaca keluaran /proc", () => {
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

test("logo dikenali dari magic bytes, SVG/teks ditolak", () => {
  assert.equal(sniffLogo(Buffer.from("89504e470d0a1a0a0000", "hex")), "png");
  assert.equal(sniffLogo(Buffer.from("ffd8ffe000104a46", "hex")), "jpg");
  assert.equal(sniffLogo(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(sniffLogo(Buffer.from("<svg onload=alert(1)>")), null);
});

test("login dikunci setelah 10 kali gagal dari IP yang sama", () => {
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

test("error SSH diterjemahkan jadi pesan yang bisa ditindaklanjuti", () => {
  assert.match(describeSshError({ level: "client-authentication" }), /Login SSH ditolak/);
  assert.match(describeSshError({ code: "ECONNREFUSED" }), /menolak/);
  assert.match(describeSshError({ level: "client-timeout" }), /Timeout/);
  assert.match(describeSshError({ code: "ENOTFOUND" }), /DNS/);
});

test("suara upload dikenali dari magic bytes", async () => {
  const { sniffSound } = await import("../src/lib/custom-sounds");
  const pad = Buffer.alloc(16);
  assert.equal(sniffSound(Buffer.concat([Buffer.from("ID3"), pad])), "mp3");
  assert.equal(sniffSound(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90]), pad])), "mp3");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("RIFF\0\0\0\0WAVE"), pad])), "wav");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("OggS"), pad])), "ogg");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("\0\0\0\x20ftypM4A "), pad])), "m4a");
  assert.equal(sniffSound(Buffer.concat([Buffer.from("<html><script>"), pad])), null);
});
