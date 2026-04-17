import { Hono } from "hono";
import { z } from "zod";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  renameProject,
  SlugCollisionError,
} from "../../vault/projects";
import { requireProfile } from "../middleware/auth";

const NameBody = z.object({ display_name: z.string().trim().min(1).max(200) });

export function projectsRoutes(): Hono {
  const r = new Hono();

  r.get("/", async (c) => c.json({ projects: await listProjects() }));

  r.get("/:slug", async (c) => {
    const project = await getProject(c.req.param("slug"));
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(project);
  });

  r.post("/", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = NameBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      const project = await createProject(parsed.data.display_name);
      return c.json(project, 201);
    } catch (e) {
      if (e instanceof SlugCollisionError) {
        return c.json({ error: "slug collision", slug: e.slug }, 409);
      }
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  r.patch("/:slug", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = NameBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const project = await renameProject(c.req.param("slug"), parsed.data.display_name);
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(project);
  });

  r.delete("/:slug", requireProfile, async (c) => {
    const project = await archiveProject(c.req.param("slug"));
    if (!project) return c.json({ error: "not found" }, 404);
    return c.json(project);
  });

  return r;
}
