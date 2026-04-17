import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { fsInferenceLogger } from "../../inference/inference-logger";
import { InferenceService } from "../../inference/inference-service";
import { type PipelineEvent, PipelineQueue, runPipeline } from "../../inference/pipeline";
import { PromptRegistry } from "../../inference/prompt-registry";
import { loadConfig } from "../config";
import { requireProfile } from "../middleware/auth";
import { resolve } from "node:path";

const queue = new PipelineQueue();

let registryPromise: Promise<PromptRegistry> | null = null;
function getRegistry(): Promise<PromptRegistry> {
  if (!registryPromise) {
    const dir = resolve(process.cwd(), "..", "prompts");
    const fallback = resolve(process.cwd(), "prompts");
    const reg = new PromptRegistry({
      promptsDir: dir,
      watch: process.env["NODE_ENV"] !== "production",
    });
    registryPromise = reg.load().catch(async () => {
      const reg2 = new PromptRegistry({
        promptsDir: fallback,
        watch: process.env["NODE_ENV"] !== "production",
      });
      await reg2.load();
      registryPromise = Promise.resolve(reg2);
      return reg2;
    }).then(() => reg);
  }
  return registryPromise;
}

function makeService(registry: PromptRegistry): InferenceService {
  const cfg = loadConfig();
  return new InferenceService({
    registry,
    ollama_url: cfg.ollama_url,
    logger: fsInferenceLogger,
  });
}

function key(project: string, sub: string): string {
  return `${project}/${sub}`;
}

export function synthesisRoutes(): Hono {
  const r = new Hono();

  r.post(
    "/projects/:project/subprojects/:sub/synthesize",
    requireProfile,
    async (c) => {
      const project = c.req.param("project");
      const sub = c.req.param("sub");
      const k = key(project, sub);
      const cfg = loadConfig();
      const registry = await getRegistry();
      const service = makeService(registry);

      return streamSSE(c, async (stream) => {
        const enqueue = async (signal: AbortSignal) => {
          for await (const event of runPipeline({
            service,
            project,
            sub,
            modelName: cfg.model_default,
            signal,
          })) {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event satisfies PipelineEvent),
            });
          }
        };
        try {
          await queue.run(k, enqueue);
        } catch (e) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ type: "error", phase: "queue", message: (e as Error).message }),
          });
        }
      });
    },
  );

  r.delete(
    "/projects/:project/subprojects/:sub/synthesize",
    requireProfile,
    async (c) => {
      const k = key(c.req.param("project"), c.req.param("sub"));
      const ok = queue.cancel(k);
      return c.json({ ok, key: k });
    },
  );

  r.get("/projects/:project/subprojects/:sub/synthesis", async (c) => {
    const { readSynthesis } = await import("../../vault/synthesis");
    const out = await readSynthesis(c.req.param("project"), c.req.param("sub"));
    if (!out) return c.json({ data: null, body: "" });
    return c.json(out);
  });

  return r;
}
