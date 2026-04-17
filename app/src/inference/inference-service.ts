import type { FetchLike } from "./ollama-health";
import type { PromptRegistry, ResolvedPrompt } from "./prompt-registry";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InferenceOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
}

export interface RunInput {
  persona_id: string;
  messages: ChatMessage[];
  override?: InferenceOptions;
  /** Force JSON output mode (Ollama format: "json"). Used by extractor / merger. */
  json?: boolean;
  /**
   * Structured output constraint passed straight through to Ollama's
   * /api/chat `format` field. Accepts a JSON Schema object (converted to
   * GBNF by Ollama/llama.cpp) or the literal string "json" for legacy
   * JSON-only mode. When `format` is set, `json` is ignored.
   *
   * Reference: https://docs.ollama.com/capabilities/structured-outputs
   * Known bug on Gemma 4 under grammar constraints: ollama/ollama#15502 —
   * token-repetition collapse on free-text string fields. Guarded by the
   * repetition detector below.
   */
  format?: object | string;
}

export type InferenceEvent =
  | { type: "token"; content: string }
  | { type: "done"; total_tokens: number; duration_ms: number }
  | { type: "error"; code: string; message: string };

export interface InferenceLogger {
  log(entry: {
    persona_id: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    duration_ms: number;
  }): void | Promise<void>;
}

export interface InferenceServiceOptions {
  registry: PromptRegistry;
  ollama_url: string;
  fetcher?: FetchLike;
  logger?: InferenceLogger;
}

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Gemma has no system role; we prepend the persona's composed prompt
 * body to the first user message. Subsequent user messages pass through
 * unmodified so multi-turn chat works.
 */
function injectPrompt(prompt: ResolvedPrompt, messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let injected = false;
  for (const m of messages) {
    if (!injected && m.role === "user") {
      out.push({ role: "user", content: `${prompt.composed}\n\n---\n\n${m.content}` });
      injected = true;
    } else {
      out.push(m);
    }
  }
  if (!injected) {
    // No user message in input — push the prompt as the first user turn.
    out.unshift({ role: "user", content: prompt.composed });
  }
  return out;
}

export class InferenceService {
  constructor(private readonly opts: InferenceServiceOptions) {}

  async *run(input: RunInput): AsyncGenerator<InferenceEvent> {
    const fetcher: FetchLike = this.opts.fetcher ?? globalThis.fetch;
    let prompt: ResolvedPrompt;
    try {
      prompt = this.opts.registry.get(input.persona_id);
    } catch (e) {
      yield { type: "error", code: "unknown_persona", message: (e as Error).message };
      return;
    }

    const merged: InferenceOptions = {
      temperature: prompt.frontmatter.temperature,
      top_p: prompt.frontmatter.top_p,
      top_k: prompt.frontmatter.top_k,
      ...input.override,
    };

    const messages = injectPrompt(prompt, input.messages);
    const url = `${this.opts.ollama_url.replace(/\/+$/, "")}/api/chat`;
    // R001: `format` (JSON Schema or "json") takes precedence over the
    // legacy `json` boolean. A structured schema is strictly stricter than
    // plain JSON mode — it forbids shape errors entirely at the sampler.
    const formatField = input.format !== undefined ? input.format : input.json ? "json" : undefined;
    const body = {
      model: prompt.frontmatter.model,
      messages,
      options: {
        temperature: merged.temperature,
        top_p: merged.top_p,
        top_k: merged.top_k,
        ...(merged.max_tokens !== undefined ? { num_predict: merged.max_tokens } : {}),
      },
      stream: true,
      ...(formatField !== undefined ? { format: formatField } : {}),
    };

    const start = Date.now();
    let res: Response;
    try {
      res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      yield { type: "error", code: "network", message: (e as Error).message };
      return;
    }

    if (!res.ok || !res.body) {
      yield { type: "error", code: "http", message: `HTTP ${res.status}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let promptTokens = 0;
    let completionTokens = 0;
    // R001 safety belt: detect Gemma 4's grammar-constraint repetition-
    // collapse (ollama/ollama#15502). If we see the same short token stream
    // repeating 20+ times in a row, abort and surface a specific error.
    let lastToken = "";
    let repeatCount = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: OllamaChatChunk;
          try {
            chunk = JSON.parse(line) as OllamaChatChunk;
          } catch {
            continue;
          }
          if (chunk.message?.content) {
            const content = chunk.message.content;
            // Only trigger on short, non-whitespace tokens — natural prose
            // can repeat words within reason.
            if (content === lastToken && content.trim().length > 0 && content.length <= 8) {
              repeatCount++;
              if (repeatCount >= 20) {
                yield {
                  type: "error",
                  code: "repetition_collapse",
                  message:
                    "Model entered token-repetition loop under grammar constraints. " +
                    "See ollama/ollama#15502 — known issue on Gemma 4; Gemma 3 typically " +
                    "unaffected. Aborting call.",
                };
                return;
              }
            } else {
              repeatCount = 0;
              lastToken = content;
            }
            yield { type: "token", content };
          }
          if (chunk.prompt_eval_count !== undefined) promptTokens = chunk.prompt_eval_count;
          if (chunk.eval_count !== undefined) completionTokens = chunk.eval_count;
          if (chunk.done) break;
        }
      }
    } catch (e) {
      yield { type: "error", code: "stream", message: (e as Error).message };
      return;
    }

    const duration_ms = Date.now() - start;
    if (this.opts.logger) {
      try {
        await this.opts.logger.log({
          persona_id: input.persona_id,
          model: prompt.frontmatter.model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          duration_ms,
        });
      } catch {
        // Logging never breaks the stream contract.
      }
    }
    yield { type: "done", total_tokens: promptTokens + completionTokens, duration_ms };
  }

  /**
   * Convenience: run and collect the full assistant text.
   * Throws on error events so callers that don't want streaming can use it ergonomically.
   */
  async runToString(input: RunInput): Promise<string> {
    let out = "";
    for await (const event of this.run(input)) {
      if (event.type === "token") out += event.content;
      if (event.type === "error") throw new Error(`${event.code}: ${event.message}`);
    }
    return out;
  }
}
