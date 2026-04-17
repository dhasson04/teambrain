import { Hono } from "hono";
import { z } from "zod";
import {
  createDump,
  deleteDump,
  DumpForbiddenError,
  getDump,
  listDumps,
  updateDump,
} from "../../vault/dumps";
import { requireProfile } from "../middleware/auth";

const Body = z.object({ content: z.string() });

export function dumpsRoutes(): Hono {
  const r = new Hono();

  r.get("/projects/:project/subprojects/:sub/dumps", requireProfile, async (c) => {
    const author = c.req.query("author") ?? "me";
    if (author === "me") {
      const dumps = await listDumps(c.req.param("project"), c.req.param("sub"), {
        author: c.var.profileId,
        includeBody: true,
      });
      return c.json({ dumps });
    }
    if (author === "all") {
      const dumps = await listDumps(c.req.param("project"), c.req.param("sub"), {
        includeBody: false,
      });
      return c.json({ dumps });
    }
    return c.json({ error: "author query must be 'me' or 'all'" }, 400);
  });

  r.get("/projects/:project/subprojects/:sub/dumps/:id", requireProfile, async (c) => {
    const dump = await getDump(c.req.param("project"), c.req.param("sub"), c.req.param("id"));
    if (!dump) return c.json({ error: "not found" }, 404);
    if (dump.author !== c.var.profileId) {
      // Other users can see only metadata, not body content
      const { body: _body, ...meta } = dump;
      return c.json(meta);
    }
    return c.json(dump);
  });

  r.post("/projects/:project/subprojects/:sub/dumps", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      const dump = await createDump(
        c.req.param("project"),
        c.req.param("sub"),
        c.var.profileId,
        parsed.data.content,
      );
      return c.json(dump, 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });

  r.patch("/projects/:project/subprojects/:sub/dumps/:id", requireProfile, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    try {
      const dump = await updateDump(
        c.req.param("project"),
        c.req.param("sub"),
        c.req.param("id"),
        parsed.data.content,
        c.var.profileId,
      );
      if (!dump) return c.json({ error: "not found" }, 404);
      return c.json(dump);
    } catch (e) {
      if (e instanceof DumpForbiddenError) return c.json({ error: e.message }, 403);
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  r.delete("/projects/:project/subprojects/:sub/dumps/:id", requireProfile, async (c) => {
    try {
      const ok = await deleteDump(
        c.req.param("project"),
        c.req.param("sub"),
        c.req.param("id"),
        c.var.profileId,
      );
      if (!ok) return c.json({ error: "not found" }, 404);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof DumpForbiddenError) return c.json({ error: e.message }, 403);
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return r;
}
