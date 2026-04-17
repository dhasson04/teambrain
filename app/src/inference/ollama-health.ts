export interface OllamaTagsModel {
  name: string;
  size?: number;
  modified_at?: string;
}

export interface OllamaTagsResponse {
  models?: OllamaTagsModel[];
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HealthInput {
  ollama_url: string;
  model: string;
  fetcher?: FetchLike;
  timeout_ms?: number;
}

export type HealthStatus =
  | { ok: true; ollama: "ok"; model_loaded: string; available_models: string[] }
  | { ok: false; ollama: "unavailable"; error: string; hint: string }
  | {
      ok: false;
      ollama: "ok";
      model_loaded: null;
      missing_model: string;
      available_models: string[];
      hint: string;
    };

const DEFAULT_TIMEOUT = 3000;

export async function checkOllama(input: HealthInput): Promise<HealthStatus> {
  const fetcher: FetchLike = input.fetcher ?? globalThis.fetch;
  const url = `${input.ollama_url.replace(/\/+$/, "")}/api/tags`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), input.timeout_ms ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetcher(url, { signal: ac.signal });
    if (!res.ok) {
      return {
        ok: false,
        ollama: "unavailable",
        error: `HTTP ${res.status}`,
        hint: `Start Ollama with: ollama serve`,
      };
    }
    const data = (await res.json()) as OllamaTagsResponse;
    const models = (data.models ?? []).map((m) => m.name);
    if (!models.includes(input.model)) {
      return {
        ok: false,
        ollama: "ok",
        model_loaded: null,
        missing_model: input.model,
        available_models: models,
        hint: `Run: ollama pull ${input.model}`,
      };
    }
    return { ok: true, ollama: "ok", model_loaded: input.model, available_models: models };
  } catch (e) {
    return {
      ok: false,
      ollama: "unavailable",
      error: (e as Error).message,
      hint: `Ollama not reachable at ${input.ollama_url}. Start it with: ollama serve`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fail-fast startup gate. Logs a clear message and exits non-zero if
 * Ollama is unreachable or the configured model is not pulled.
 */
export async function assertOllamaReady(input: HealthInput): Promise<void> {
  const status = await checkOllama(input);
  if (status.ok) return;
  console.error(`[ollama] ${status.ollama}: ${status.hint}`);
  if (status.ollama === "ok" && status.model_loaded === null) {
    console.error(`[ollama] available models: ${status.available_models.join(", ") || "(none)"}`);
  }
  process.exit(1);
}
