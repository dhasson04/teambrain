import { useCallback, useEffect, useRef, useState } from "react";

export interface SSEEvent<T = unknown> {
  event: string;
  data: T;
}

export interface UseSSEOptions {
  url: string;
  body?: unknown;
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  /** Auto-start on mount. Default false. Use start() to fire manually. */
  auto?: boolean;
  onEvent?: (event: SSEEvent) => void;
  onError?: (err: Error) => void;
}

interface UseSSEResult {
  /** Tokens accumulated from any "token" event with shape { content: string } */
  text: string;
  events: SSEEvent[];
  status: "idle" | "connecting" | "streaming" | "done" | "error";
  error: Error | null;
  start: () => void;
  stop: () => void;
}

interface DataLine {
  event: string;
  data: string;
}

/**
 * Manual SSE reader over fetch. EventSource doesn't support POST/headers.
 * Parses standard SSE framing (lines starting with "event:" / "data:" with
 * blank-line message terminator) and dispatches each message via onEvent +
 * accumulates "token" events into a single text string for chat-style UIs.
 */
export function useSSE(options: UseSSEOptions): UseSSEResult {
  const [text, setText] = useState("");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<UseSSEResult["status"]>("idle");
  const [error, setError] = useState<Error | null>(null);
  const ac = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (ac.current) {
      ac.current.abort();
      ac.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setText("");
    setEvents([]);
    setError(null);
    setStatus("connecting");
    const controller = new AbortController();
    ac.current = controller;
    void (async () => {
      try {
        const res = await fetch(options.url, {
          method: options.method ?? "POST",
          headers: {
            ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
            ...options.headers,
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }
        setStatus("streaming");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let pending: DataLine | null = null;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, "");
            if (line === "") {
              if (pending) {
                let parsed: unknown = pending.data;
                try {
                  parsed = JSON.parse(pending.data);
                } catch {
                  /* keep raw */
                }
                const ev: SSEEvent = { event: pending.event, data: parsed };
                setEvents((prev) => [...prev, ev]);
                if (
                  pending.event === "token" &&
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "content" in parsed &&
                  typeof (parsed as { content: unknown }).content === "string"
                ) {
                  setText((t) => t + (parsed as { content: string }).content);
                }
                options.onEvent?.(ev);
                pending = null;
              }
              continue;
            }
            if (line.startsWith("event:")) {
              if (!pending) pending = { event: "message", data: "" };
              pending.event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              if (!pending) pending = { event: "message", data: "" };
              pending.data += (pending.data ? "\n" : "") + line.slice(5).trim();
            }
          }
        }
        setStatus("done");
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          setStatus("idle");
          return;
        }
        const err = e as Error;
        setError(err);
        setStatus("error");
        options.onError?.(err);
      } finally {
        ac.current = null;
      }
    })();
  }, [options.url, options.body, options.method, options.headers, options.onEvent, options.onError]);

  useEffect(() => {
    if (options.auto) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { text, events, status, error, start, stop };
}
