import fs from "fs";
import { dataFile } from "./data-dir";

/** Alert sounds the operator can replace from Settings (stored as DATA_DIR/sounds/<name>.<ext>). */
export const SOUND_NAMES = ["down", "recovery"] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export const SOUND_TYPES = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
} as const;
export type SoundExt = keyof typeof SOUND_TYPES;
export const MAX_SOUND_BYTES = 1024 * 1024;

export function isSoundName(v: string): v is SoundName {
  return (SOUND_NAMES as readonly string[]).includes(v);
}

/** Identify the audio format by its magic bytes, never by the client-supplied name/type. */
export function sniffSound(buf: Buffer): SoundExt | null {
  if (buf.length < 12) return null;
  if (buf.toString("ascii", 0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3"; // MPEG frame sync
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (buf.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (buf.toString("ascii", 4, 8) === "ftyp") return "m4a";
  return null;
}

export function customSound(name: SoundName): { file: string; type: string } | null {
  for (const ext of Object.keys(SOUND_TYPES) as SoundExt[]) {
    const file = dataFile(`sounds/${name}.${ext}`);
    if (fs.existsSync(file)) return { file, type: SOUND_TYPES[ext] };
  }
  return null;
}

export function saveSound(name: SoundName, buf: Buffer, ext: SoundExt) {
  removeSound(name);
  fs.mkdirSync(dataFile("sounds"), { recursive: true });
  fs.writeFileSync(dataFile(`sounds/${name}.${ext}`), buf);
}

export function removeSound(name: SoundName) {
  for (const ext of Object.keys(SOUND_TYPES)) fs.rmSync(dataFile(`sounds/${name}.${ext}`), { force: true });
}
