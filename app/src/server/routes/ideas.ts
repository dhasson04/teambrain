import { Hono } from "hono";
import { readConnections, readIdeas, readAttribution } from "../../vault/ideas";

export function ideasRoutes(): Hono {
  const r = new Hono();

  r.get("/projects/:project/subprojects/:sub/ideas", async (c) =>
    c.json(await readIdeas(c.req.param("project"), c.req.param("sub"))),
  );

  r.get("/projects/:project/subprojects/:sub/connections", async (c) =>
    c.json(await readConnections(c.req.param("project"), c.req.param("sub"))),
  );

  r.get("/projects/:project/subprojects/:sub/attribution", async (c) =>
    c.json(await readAttribution(c.req.param("project"), c.req.param("sub"))),
  );

  return r;
}
