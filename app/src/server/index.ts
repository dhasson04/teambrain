import { Hono } from "hono";
import { initVault } from "../vault/init";
import { dumpsRoutes } from "./routes/dumps";
import { ideasRoutes } from "./routes/ideas";
import { materialsRoutes } from "./routes/materials";
import { profilesRoutes } from "./routes/profiles";
import { projectsRoutes } from "./routes/projects";
import { subprojectsRoutes } from "./routes/subprojects";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "teambrain",
      version: "0.1.0",
    }),
  );

  app.route("/api/profiles", profilesRoutes());
  app.route("/api/projects", projectsRoutes());
  app.route("/api", subprojectsRoutes());
  app.route("/api", materialsRoutes());
  app.route("/api", dumpsRoutes());
  app.route("/api", ideasRoutes());

  return app;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  const init = await initVault();
  console.log(
    `vault: ${init.vaultRoot}` +
      (init.createdVault ? " (created)" : "") +
      (init.seededProfile ? " (seeded default profile)" : ""),
  );
  const app = createApp();
  Bun.serve({ port, fetch: app.fetch });
  console.log(`teambrain server listening on http://127.0.0.1:${port}`);
}
