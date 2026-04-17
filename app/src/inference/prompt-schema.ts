import { z } from "zod";

export const PromptFrontmatterSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver x.y.z"),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    top_p: z.number().min(0).max(1),
    top_k: z.number().int().min(1).max(1024),
    description: z.string().min(1),
    includes: z.array(z.string()).default([]),
  })
  .strict();

export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>;

export const SynthesisFrontmatterSchema = PromptFrontmatterSchema.extend({
  id: z.literal("synthesis"),
  temperature: z
    .number()
    .min(0)
    .max(0.7, "synthesis must stay convergent (temperature <= 0.7)"),
});

export const ExplorationFrontmatterSchema = PromptFrontmatterSchema.extend({
  id: z.literal("exploration"),
  temperature: z
    .number()
    .min(0.7, "exploration must be divergent (temperature >= 0.7)")
    .max(2),
});
