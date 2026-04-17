import type { MiddlewareHandler } from "hono";
import { findProfile } from "../../vault/profiles";

export const PROFILE_HEADER = "X-Profile-Id";

declare module "hono" {
  interface ContextVariableMap {
    profileId: string;
  }
}

/**
 * Requires a valid X-Profile-Id header. Sets c.var.profileId on success,
 * returns 401 on missing or unknown profile id.
 *
 * Mount on every write endpoint (POST/PATCH/DELETE).
 */
export const requireProfile: MiddlewareHandler = async (c, next) => {
  const id = c.req.header(PROFILE_HEADER);
  if (!id) {
    return c.json({ error: "missing X-Profile-Id header" }, 401);
  }
  const profile = await findProfile(id);
  if (!profile) {
    return c.json({ error: "unknown profile id" }, 401);
  }
  c.set("profileId", profile.id);
  await next();
};
