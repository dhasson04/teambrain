import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface FeatureFlags {
  /** R001 — grammar-constrained outputs on extract/merge/render. */
  grammar_constrained_output?: boolean;
  /** R002 — swap LLM merge for embedding + agglomerative clustering. */
  embedding_cluster?: boolean;
  /** R003 — NLI cross-encoder for contradictions. */
  nli_contradict?: boolean;
  /** R004 — noun-phrase hints in extractor prompt. */
  hint_block_in_extractor?: boolean;
  /** R005 — contextual retrieval over materials + problem.md. */
  retrieval_at_render?: boolean;
  /** R006 — split extract + classify into separate LLM calls. */
  pipeline_decomp?: boolean;
}

export interface AppConfig {
  model_default: string;
  ollama_url: string;
  vault: string;
  /** Max retries per dump when an evidence_quote fails normalized matching. */
  extract_max_retries: number;
  /** Default cosine-similarity threshold for agglomerative clustering (R002). */
  cluster_threshold: number;
  /** Per-leverage rollout flags. Undefined flag = enabled (new behaviour). */
  features: FeatureFlags;
}

const DEFAULTS: AppConfig = {
  model_default: "gemma3:4b",
  ollama_url: "http://127.0.0.1:11434",
  vault: "./vault",
  extract_max_retries: 2,
  cluster_threshold: 0.55,
  features: {
    grammar_constrained_output: true,
    embedding_cluster: true,
    nli_contradict: true,
    hint_block_in_extractor: true,
    retrieval_at_render: true,
    pipeline_decomp: true,
  },
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
    cluster_threshold:
      Number(process.env["TEAMBRAIN_CLUSTER_THRESHOLD"]) ||
      onDisk.cluster_threshold ||
      DEFAULTS.cluster_threshold,
    features: { ...DEFAULTS.features, ...(onDisk.features ?? {}) },
  };
  cached = merged;
  return merged;
}

export function resetConfigCache(): void {
  cached = null;
}
