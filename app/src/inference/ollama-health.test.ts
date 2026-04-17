import { describe, expect, test } from "bun:test";
import { checkOllama, type FetchLike } from "./ollama-health";

function fakeFetch(impl: (url: string) => Response | Promise<Response>): FetchLike {
  return async (url) => impl(typeof url === "string" ? url : String(url));
}

const reachable = (models: string[]) =>
  fakeFetch(() => new Response(JSON.stringify({ models: models.map((name) => ({ name })) })));

describe("checkOllama", () => {
  test("ok when Ollama reachable and model present", async () => {
    const status = await checkOllama({
      ollama_url: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      fetcher: reachable(["gemma3:4b", "llama3:8b"]),
    });
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.model_loaded).toBe("gemma3:4b");
      expect(status.available_models).toContain("gemma3:4b");
    }
  });

  test("flags missing model with pull hint when Ollama is up", async () => {
    const status = await checkOllama({
      ollama_url: "http://127.0.0.1:11434",
      model: "gemma3:12b",
      fetcher: reachable(["gemma3:4b"]),
    });
    expect(status.ok).toBe(false);
    if (!status.ok && status.ollama === "ok") {
      expect(status.missing_model).toBe("gemma3:12b");
      expect(status.hint).toBe("Run: ollama pull gemma3:12b");
    }
  });

  test("flags unavailable on network error with serve hint", async () => {
    const status = await checkOllama({
      ollama_url: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      fetcher: fakeFetch(() => {
        throw new Error("ECONNREFUSED");
      }),
    });
    expect(status.ok).toBe(false);
    if (!status.ok && status.ollama === "unavailable") {
      expect(status.hint).toContain("ollama serve");
    }
  });

  test("flags unavailable on non-2xx HTTP", async () => {
    const status = await checkOllama({
      ollama_url: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      fetcher: fakeFetch(() => new Response("x", { status: 500 })),
    });
    expect(status.ok).toBe(false);
    if (!status.ok && status.ollama === "unavailable") {
      expect(status.error).toContain("HTTP 500");
    }
  });

  test("respects custom timeout via AbortController", async () => {
    const status = await checkOllama({
      ollama_url: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      timeout_ms: 50,
      fetcher: fakeFetch(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(new Response("{}")), 500);
          }),
      ),
    });
    expect(status.ok).toBe(false);
  });
});
