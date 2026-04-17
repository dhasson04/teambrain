import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  model_default: string;
  ollama_url: string;
  vault: string;
  /** Max retries per dump when an evidence_quote fails normalized matching. */
  extract_max_retries: number;
}

const DEFAULTS: AppConfig = {
  model_default: "gemma3:4b",
  ollama_url: "http://127.0.0.1:11434",
  vault: "./vault",
  extract_max_retries: 2,
};

let cached: AppConfig | null = null;

function configPath(): string {
  if (process.env["TEAMBRAIN_CONFIG"]) return resolve(process.env["TEAMBRAIN_CONFIG"]);
  // Repo-root config.json. The app runs from the repo root or app/, so check both.
  const candidates = [resolve("./config.json"), resolve("../config.json")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

export function loadConfig(forceReload = false): AppConfig {
  if (cached && !forceReload) return cached;
  const path = configPath();
  const onDisk = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Partial<AppConfig>)
    : {};
  const merged: AppConfig = {
    model_default: process.env["TEAMBRAIN_MODEL"] ?? onDisk.model_default ?? DEFAULTS.model_default,
    ollama_url: process.env["OLLAMA_URL"] ?? onDisk.ollama_url ?? DEFAULTS.ollama_url,
    vault: process.env["TEAMBRAIN_VAULT"] ?? onDisk.vault ?? DEFAULTS.vault,
    extract_max_retries:
      Number(process.env["TEAMBRAIN_EXTRACT_MAX_RETRIES"]) ||
      onDisk.extract_max_retries ||
      DEFAULTS.extract_max_retries,
  };
  cached = merged;
  return merged;
}

export function resetConfigCache(): void {
  cached = null;
}
