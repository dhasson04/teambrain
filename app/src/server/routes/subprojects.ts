import { Hono } from "hono";
import { z } from "zod";
import {
  archiveSubproject,
  createSubproject,
  getSubproject,
  listSubprojects,
  ParentMissingError,
  renameSubproject,
  SubSlugCollisionError,
} from "../../vault/subprojects";
import { requireProfile } from "../middleware/auth";

const NameBody = z.object({ display_name: z.string().trim().min(1).max(200) });

export function subprojectsRoutes(): Hono {
  const r = new Hono();

  r.get("/projects/:project/subprojects", async (c) =>
    c.json({ subprojects: await listSubprojects(c.req.param("project")) }),
  );

  r.get("/projects/:project/subprojects/:sub", async (c) => {
    const meta = await getSubproject(c.req.param("project"), c.req.param("sub"));
    if (!meta) return c.json({ error: "not found" }, 404);
    return c.json(meta);
  });

  r.post("/projects/:project/subprojects", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = NameBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      const meta = await createSubproject(c.req.param("project"), parsed.data.display_name);
      return c.json(meta, 201);
    } catch (e) {
      if (e instanceof ParentMissingError) return c.json({ error: e.message }, 404);
      if (e instanceof SubSlugCollisionError) return c.json({ error: "slug collision", slug: e.slug }, 409);
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  r.patch("/projects/:project/subprojects/:sub", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = NameBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const meta = await renameSubproject(c.req.param("project"), c.req.param("sub"), parsed.data.display_name);
    if (!meta) return c.json({ error: "not found" }, 404);
    return c.json(meta);
  });

  r.delete("/projects/:project/subprojects/:sub", requireProfile, async (c) => {
    const meta = await archiveSubproject(c.req.param("project"), c.req.param("sub"));
    if (!meta) return c.json({ error: "not found" }, 404);
    return c.json(meta);
  });

  return r;
}
