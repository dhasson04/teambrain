import { Hono } from "hono";
import { z } from "zod";
import {
  addMaterial,
  getMaterial,
  listMaterials,
  readProblem,
  writeProblem,
} from "../../vault/materials";
import { requireProfile } from "../middleware/auth";

const ProblemBody = z.object({ content: z.string() });
const MaterialBody = z.object({
  filename: z.string().min(1).max(200),
  content: z.string(),
  source: z.string().optional(),
});

export function materialsRoutes(): Hono {
  const r = new Hono();

  r.get("/projects/:project/subprojects/:sub/problem", async (c) => {
    const out = await readProblem(c.req.param("project"), c.req.param("sub"));
    if (!out) return c.json({ data: null, body: "" });
    return c.json(out);
  });

  r.put("/projects/:project/subprojects/:sub/problem", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ProblemBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      await writeProblem(c.req.param("project"), c.req.param("sub"), parsed.data.content, c.var.profileId);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });

  r.get("/projects/:project/subprojects/:sub/materials", async (c) =>
    c.json({ materials: await listMaterials(c.req.param("project"), c.req.param("sub")) }),
  );

  r.get("/projects/:project/subprojects/:sub/materials/:filename", async (c) => {
    const out = await getMaterial(
      c.req.param("project"),
      c.req.param("sub"),
      c.req.param("filename"),
    );
    if (!out) return c.json({ error: "not found" }, 404);
    return c.json(out);
  });

  r.post("/projects/:project/subprojects/:sub/materials", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = MaterialBody.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      const meta = await addMaterial(
        c.req.param("project"),
        c.req.param("sub"),
        parsed.data.filename,
        parsed.data.content,
        c.var.profileId,
        { source: parsed.data.source },
      );
      return c.json(meta, 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return r;
}
