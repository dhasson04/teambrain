import { Hono } from "hono";
import { assertOllamaReady, checkOllama } from "../inference/ollama-health";
import { initVault } from "../vault/init";
import { loadConfig } from "./config";
import { dumpsRoutes } from "./routes/dumps";
import { explorationRoutes } from "./routes/exploration";
import { ideasRoutes } from "./routes/ideas";
import { materialsRoutes } from "./routes/materials";
import { profilesRoutes } from "./routes/profiles";
import { projectsRoutes } from "./routes/projects";
import { subprojectsRoutes } from "./routes/subprojects";
import { synthesisRoutes } from "./routes/synthesis";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", async (c) => {
    const cfg = loadConfig();
    const status = await checkOllama({ ollama_url: cfg.ollama_url, model: cfg.model_default });
    return c.json({
      ok: true,
      service: "teambrain",
      version: "0.1.0",
      ollama: status.ollama,
      model_loaded: status.ok ? status.model_loaded : null,
      registry_loaded: false,
    });
  });

  app.route("/api/profiles", profilesRoutes());
  app.route("/api/projects", projectsRoutes());
  app.route("/api", subprojectsRoutes());
  app.route("/api", materialsRoutes());
  app.route("/api", dumpsRoutes());
  app.route("/api", ideasRoutes());
  app.route("/api", synthesisRoutes());
  app.route("/api", explorationRoutes());

  return app;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  const cfg = loadConfig();
  await assertOllamaReady({ ollama_url: cfg.ollama_url, model: cfg.model_default });
  const init = await initVault();
  console.log(
    `vault: ${init.vaultRoot}` +
      (init.createdVault ? " (created)" : "") +
      (init.seededProfile ? " (seeded default profile)" : ""),
  );
  console.log(`ollama: ${cfg.ollama_url} model=${cfg.model_default}`);
  const app = createApp();
  Bun.serve({ port, fetch: app.fetch });
  console.log(`teambrain server listening on http://127.0.0.1:${port}`);
}
