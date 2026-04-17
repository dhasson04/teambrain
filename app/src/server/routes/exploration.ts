import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  appendTabMessage,
  buildContextBlock,
  InvalidTabId,
  loadTabHistory,
  retrieveFromGraph,
} from "../../inference/exploration";
import { fsInferenceLogger } from "../../inference/inference-logger";
import { InferenceService, type ChatMessage } from "../../inference/inference-service";
import { PromptRegistry } from "../../inference/prompt-registry";
import { loadConfig } from "../config";
import { requireProfile } from "../middleware/auth";
import { resolve } from "node:path";

const ChatBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  subproject_id: z
    .object({ project: z.string(), sub: z.string() })
    .nullable()
    .optional(),
  tab_id: z.string().min(1).max(64),
});

let registryPromise: Promise<PromptRegistry> | null = null;
function getRegistry(): Promise<PromptRegistry> {
  if (registryPromise) return registryPromise;
  const primary = resolve(process.cwd(), "..", "prompts");
  registryPromise = (async () => {
    try {
      const r = new PromptRegistry({ promptsDir: primary, watch: process.env["NODE_ENV"] !== "production" });
      await r.load();
      return r;
    } catch {
      const fallback = resolve(process.cwd(), "prompts");
      const r = new PromptRegistry({ promptsDir: fallback, watch: process.env["NODE_ENV"] !== "production" });
      await r.load();
      return r;
    }
  })();
  return registryPromise;
}

export function explorationRoutes(): Hono {
  const r = new Hono();

  r.get("/exploration/tabs/:tab_id", requireProfile, async (c) => {
    try {
      const history = await loadTabHistory(c.req.param("tab_id"));
      return c.json({ history });
    } catch (e) {
      if (e instanceof InvalidTabId) return c.json({ error: e.message }, 400);
      throw e;
    }
  });

  r.post("/exploration/chat", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ChatBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body", details: parsed.error.issues }, 400);
    const { messages, subproject_id, tab_id } = parsed.data;

    const cfg = loadConfig();
    const registry = await getRegistry();
    const service = new InferenceService({
      registry,
      ollama_url: cfg.ollama_url,
      logger: fsInferenceLogger,
    });

    return streamSSE(c, async (stream) => {
      try {
        // Persist the latest user message
        const latest = messages[messages.length - 1];
        if (latest && latest.role === "user") {
          try {
            await appendTabMessage(tab_id, subproject_id ? `${subproject_id.project}/${subproject_id.sub}` : null, latest);
          } catch (e) {
            if (e instanceof InvalidTabId) {
              await stream.writeSSE({ event: "error", data: JSON.stringify({ message: e.message }) });
              return;
            }
            throw e;
          }
        }

        // Build context block from knowledge graph if subproject provided
        let contextBlock = "";
        if (subproject_id && latest && latest.role === "user") {
          const retrieved = await retrieveFromGraph(subproject_id.project, subproject_id.sub, latest.content);
          contextBlock = buildContextBlock(retrieved);
          if (retrieved.length > 0) {
            await stream.writeSSE({
              event: "context",
              data: JSON.stringify({ retrieved_ids: retrieved.map((r) => r.idea_id) }),
            });
          }
        }

        // Inject context as a prefix on the first user message (Gemma has no system role)
        const wrappedMessages: ChatMessage[] = messages.map((m, i) => {
          if (i === 0 && m.role === "user" && contextBlock) {
            return { role: "user", content: `${contextBlock}${m.content}` };
          }
          return m;
        });

        let assistantText = "";
        for await (const event of service.run({
          persona_id: "exploration",
          messages: wrappedMessages,
        })) {
          if (event.type === "token") {
            assistantText += event.content;
            await stream.writeSSE({ event: "token", data: JSON.stringify({ content: event.content }) });
          } else if (event.type === "done") {
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({ total_tokens: event.total_tokens, duration_ms: event.duration_ms }),
            });
          } else if (event.type === "error") {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ code: event.code, message: event.message }),
            });
            return;
          }
        }

        // Persist the assistant reply
        if (assistantText.trim().length > 0) {
          await appendTabMessage(
            tab_id,
            subproject_id ? `${subproject_id.project}/${subproject_id.sub}` : null,
            { role: "assistant", content: assistantText },
          );
        }
      } catch (e) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: (e as Error).message }),
        });
      }
    });
  });

  return r;
}
