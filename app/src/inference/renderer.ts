import { loadConfig } from "../server/config";
import type { AttributionFile } from "../vault/ideas";
import { readIdeasBundle } from "../vault/ideas";
import { loadProfiles } from "../vault/profiles";
import { writeSynthesis } from "../vault/synthesis";
import type { DumpHashEntry } from "../vault/synthesis";
import type { InferenceService } from "./inference-service";
import { formatProjectContextBlock, retrieveForRender } from "./retrieval";
import { validateCitations } from "./validator";

// R001: the renderer now returns STRUCTURED JSON that this module assembles
// into canonical markdown with fixed section headers. The LLM cannot
// emit "## Concerns" or invent section names because it never emits
// section headers at all — they're assembled deterministically here.
const RENDER_INSTRUCTIONS = `
You will receive a JSON snapshot of a project's clustered ideas,
contradiction edges, and attribution. Produce structured JSON describing
three categories of bullets:

- agreed: bullets where multiple authors converged on the same idea
  (one entry per cluster of size >= 2)
- disputed: bullets for contradiction edges, with both sides quoted
- move_forward: bullets for "deliverable"-typed ideas that have cluster
  support and no attached contradiction

Each bullet cites one or more [author, dump_id] pairs. Author is the human
display name (e.g. "Alice") exactly as it appears in attribution; dump_id
is the FULL string including timestamp suffix.

Use verbatim_quote fragments from attribution when referencing a dump.
Return strict JSON per the provided schema. No preamble, no prose outside
the JSON.
`;

const RENDER_FORMAT = {
  type: "object",
  properties: {
    agreed: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1 },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                author: { type: "string", minLength: 1 },
                dump_id: { type: "string", minLength: 1 },
              },
              required: ["author", "dump_id"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "citations"],
        additionalProperties: false,
      },
    },
    disputed: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1 },
          citations: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              properties: {
                author: { type: "string", minLength: 1 },
                dump_id: { type: "string", minLength: 1 },
              },
              required: ["author", "dump_id"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "citations"],
        additionalProperties: false,
      },
    },
    move_forward: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 1 },
          citations: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                author: { type: "string", minLength: 1 },
                dump_id: { type: "string", minLength: 1 },
              },
              required: ["author", "dump_id"],
              additionalProperties: false,
            },
          },
        },
        required: ["text", "citations"],
        additionalProperties: false,
      },
    },
  },
  required: ["agreed", "disputed", "move_forward"],
  additionalProperties: false,
} as const;

interface RenderBullet {
  text: string;
  citations: Array<{ author: string; dump_id: string }>;
}
interface RenderJson {
  agreed: RenderBullet[];
  disputed: RenderBullet[];
  move_forward: RenderBullet[];
}

/**
 * Assemble the canonical markdown from structured render JSON.
 * The three section headers — "## Agreed", "## Disputed", "## Move forward" —
 * are hardcoded here. The LLM never sees or produces them, so drift to
 * "## Concerns" or missing sections is structurally impossible.
 */
function assembleMarkdown(j: RenderJson): string {
  const formatBullet = (b: RenderBullet): string => {
    const cites = b.citations.map((c) => `[${c.author}, ${c.dump_id}]`).join(" ");
    return `- ${b.text} ${cites}`;
  };
  const section = (heading: string, bullets: RenderBullet[]): string => {
    const body = bullets.length > 0 ? bullets.map(formatBullet).join("\n") : "_(none)_";
    return `## ${heading}\n${body}`;
  };
  return [
    section("Agreed", j.agreed),
    section("Disputed", j.disputed),
    section("Move forward", j.move_forward),
  ].join("\n\n");
}

async function attributionWithDisplayNames(raw: AttributionFile): Promise<AttributionFile> {
  const profiles = await loadProfiles();
  const nameById = new Map(profiles.profiles.map((p) => [p.id, p.display_name]));
  const out: AttributionFile = {};
  for (const [ideaId, entries] of Object.entries(raw)) {
    out[ideaId] = entries.map((e) => ({
      dump_id: e.dump_id,
      author: nameById.get(e.author) ?? e.author,
      verbatim_quote: e.verbatim_quote,
    }));
  }
  return out;
}

export interface RenderInput {
  service: InferenceService;
  project: string;
  sub: string;
  modelName: string;
  inputs: DumpHashEntry[];
  maxRetries?: number;
}

export interface RenderResult {
  ok: boolean;
  body: string;
  attempts: number;
  validatorComplaints: string[];
}

export async function renderSynthesis(input: RenderInput): Promise<RenderResult> {
  const maxRetries = input.maxRetries ?? 2;
  const bundle = await readIdeasBundle(input.project, input.sub);
  if (bundle.ideas.ideas.length === 0) {
    throw new Error("no ideas to render — run extract + merge first");
  }
  const compact = JSON.stringify(
    {
      ideas: bundle.ideas.ideas,
      connections: bundle.connections.connections,
      attribution: await attributionWithDisplayNames(bundle.attribution),
    },
    null,
    2,
  );

  // R005: contextual retrieval over materials + problem.md. Feeds a
  // <project-context> block into the render prompt so materials
  // actually influence output. Closes the "Big Lie" from the 2026-04-17
  // deep-dive deck slide 11. Feature-flagged; empty block when disabled.
  let projectContext = "";
  if (loadConfig().features?.retrieval_at_render !== false) {
    try {
      const ideaStatements = bundle.ideas.ideas.map((i) => i.statement);
      const chunks = await retrieveForRender(input.project, input.sub, ideaStatements, 3);
      projectContext = formatProjectContextBlock(chunks);
    } catch {
      // Never let retrieval failures block rendering.
      projectContext = "";
    }
  }

  let lastBody = "";
  let lastComplaints: string[] = [];
  let priorComplaints: string[] | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const contextBlock = projectContext ? `\n\n${projectContext}` : "";
    const userMsg =
      attempt === 0
        ? `${RENDER_INSTRUCTIONS}\n\n<context>\n${compact}\n</context>${contextBlock}`
        : `${RENDER_INSTRUCTIONS}\n\n<context>\n${compact}\n</context>${contextBlock}\n\n<previous-output>\n${lastBody}\n</previous-output>\n\n<repair>\nThe previous output had these citation problems:\n${lastComplaints.join("\n- ")}\nRe-emit with those fixes.\n</repair>`;
    const raw = await input.service.runToString({
      persona_id: "synthesis",
      // R001: sampler-enforced structured JSON. Section headers are
      // assembled deterministically in assembleMarkdown below.
      format: RENDER_FORMAT,
      messages: [{ role: "user", content: userMsg }],
    });
    let json: RenderJson;
    try {
      json = JSON.parse(raw) as RenderJson;
    } catch (e) {
      lastComplaints = [`render JSON parse failed: ${(e as Error).message}`];
      if (priorComplaints && sameComplaints(priorComplaints, lastComplaints)) break;
      priorComplaints = lastComplaints;
      continue;
    }
    const body = assembleMarkdown(json);
    const validation = await validateCitations({
      markdown: body,
      project: input.project,
      sub: input.sub,
    });
    lastBody = body;
    lastComplaints = validation.complaints.map((c) => c.reason);
    if (validation.ok) {
      await writeSynthesis(
        input.project,
        input.sub,
        body.trim(),
        {
          created: new Date().toISOString(),
          dump_count: input.inputs.length,
          model: input.modelName,
        },
        input.inputs,
      );
      return { ok: true, body, attempts: attempt + 1, validatorComplaints: [] };
    }
    // Short-circuit: if the model produced the same complaint set as the prior
    // attempt, more retries with the same repair prompt won't yield new info.
    if (priorComplaints && sameComplaints(priorComplaints, lastComplaints)) {
      break;
    }
    priorComplaints = lastComplaints;
  }
  return { ok: false, body: lastBody, attempts: maxRetries + 1, validatorComplaints: lastComplaints };
}

function sameComplaints(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}
