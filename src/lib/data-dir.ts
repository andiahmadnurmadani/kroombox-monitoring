import fs from "fs";
import path from "path";

/** Where every runtime file lives (monitors, hosts, auth, status caches, logo).
 * Defaults to ./data next to the app; the systemd install points it at
 * /var/lib/kroombox-monitor via DATA_DIR so the code directory can stay read-only. */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name);
}

export function readJson<T>(file: string): T | undefined {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    // corrupt file: caller falls back to its defaults, next write recreates it
  }
  return undefined;
}

/** Write-then-rename so a crash or power cut mid-write never leaves a half-written
 * JSON file behind (which would silently reset that store on the next start). */
export function writeJson(file: string, data: unknown, mode = 0o644) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode });
  fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}
