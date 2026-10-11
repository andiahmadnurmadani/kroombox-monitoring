import { dataFile, readJson, writeJson } from "./data-dir";

const FILE = "sound-settings.json";

export interface SoundSettings {
  enabled: boolean;
  startTime: string; // "HH:MM", 24-hour
  endTime: string; // "HH:MM", 24-hour — may be "before" startTime to mean an overnight window
}

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  startTime: "00:00",
  endTime: "23:59",
};

export function loadSoundSettings(): SoundSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<SoundSettings>>(dataFile(FILE)) };
}

export function saveSoundSettings(settings: SoundSettings) {
  writeJson(dataFile(FILE), settings);
}

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}
