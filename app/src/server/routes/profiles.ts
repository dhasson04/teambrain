import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { addProfile, loadProfiles, makeProfile } from "../../vault/profiles";

const NewProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(100),
});

export function profilesRoutes(): Hono {
  const r = new Hono();

  r.get("/", async (c) => {
    const file = await loadProfiles();
    return c.json(file);
  });

  r.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = NewProfileSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body", details: parsed.error.issues }, 400);
    }
    const profile = makeProfile({ id: randomUUID(), display_name: parsed.data.display_name });
    await addProfile(profile);
    return c.json(profile, 201);
  });

  return r;
}
