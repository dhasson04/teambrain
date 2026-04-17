import { Hono } from "hono";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "teambrain",
      version: "0.1.0",
    }),
  );

  return app;
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  const app = createApp();
  Bun.serve({ port, fetch: app.fetch });
  console.log(`teambrain server listening on http://127.0.0.1:${port}`);
}
