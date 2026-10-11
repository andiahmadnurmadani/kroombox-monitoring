import fs from "fs";
import { dataFile, readJson, writeJson } from "./data-dir";

/** Branding shown in the header, login page and browser tab — editable in Settings. */
export interface AppSettings {
  appName: string;
}

const FILE = "settings.json";
export const DEFAULT_APP_NAME = process.env.APP_NAME?.trim() || "Kroombox Monitoring";
export const MAX_APP_NAME = 40;

export function loadAppSettings(): AppSettings {
  const saved = readJson<Partial<AppSettings>>(dataFile(FILE)) ?? {};
  return { appName: saved.appName?.trim() || DEFAULT_APP_NAME };
}

export function saveAppSettings(settings: AppSettings) {
  writeJson(dataFile(FILE), settings);
}

// --- custom logo (data/logo.<ext>); without one the bundled /logo.png is used ---

export const LOGO_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
export type LogoExt = keyof typeof LOGO_TYPES;
export const MAX_LOGO_BYTES = 512 * 1024;

/** Identify the image by its magic bytes, never by the client-supplied name/type.
 * SVG is deliberately not accepted: it can carry script. */
export function sniffLogo(buf: Buffer): LogoExt | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export function customLogo(): { file: string; type: string } | null {
  for (const ext of Object.keys(LOGO_TYPES) as LogoExt[]) {
    const file = dataFile(`logo.${ext}`);
    if (fs.existsSync(file)) return { file, type: LOGO_TYPES[ext] };
  }
  return null;
}

export function saveLogo(buf: Buffer, ext: LogoExt) {
  removeLogo();
  fs.mkdirSync(dataFile(""), { recursive: true });
  fs.writeFileSync(dataFile(`logo.${ext}`), buf);
}

export function removeLogo() {
  for (const ext of Object.keys(LOGO_TYPES)) fs.rmSync(dataFile(`logo.${ext}`), { force: true });
}
