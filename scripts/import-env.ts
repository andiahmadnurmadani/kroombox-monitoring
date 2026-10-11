/**
 * Import servers/NAS from an old-style .env.local (NAS_* and SERVERS_JSON) into
 * hosts.json. Hosts whose id already exists are left alone, so it is safe to re-run.
 *
 *   DATA_DIR=/var/lib/kroombox-monitor npx tsx scripts/import-env.ts /path/to/.env.local
 */
import fs from "fs";
import { dataFile, readJson, writeJson } from "../src/lib/data-dir";
import { hostsFromLegacyEnv } from "../src/lib/host-store";
import type { HostConfig } from "../src/lib/host-types";

function parseDotenv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Pemakaian: tsx scripts/import-env.ts <file .env lama>");
  process.exit(1);
}
const imported = hostsFromLegacyEnv(parseDotenv(fs.readFileSync(file, "utf-8")));
const target = dataFile("hosts.json");
const current = readJson<{ version: 1; hosts: HostConfig[] }>(target) ?? { version: 1 as const, hosts: [] };
const known = new Set(current.hosts.map((h) => h.id));
const added = imported.filter((h) => !known.has(h.id));
writeJson(target, { version: 1, hosts: [...current.hosts, ...added] }, 0o600);
console.log(`${added.length} host diimpor ke ${target} (${imported.length - added.length} sudah ada, dilewati)`);
