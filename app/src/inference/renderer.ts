import type { AttributionFile } from "../vault/ideas";
import { readIdeasBundle } from "../vault/ideas";
import { loadProfiles } from "../vault/profiles";
import { writeSynthesis } from "../vault/synthesis";
import type { DumpHashEntry } from "../vault/synthesis";
import type { InferenceService } from "./inference-service";
import { validateCitations } from "./validator";

const RENDER_INSTRUCTIONS = `
You will receive a JSON snapshot of a project's clustered ideas,
contradiction edges, and attribution. Render a markdown document with
exactly three sections:

## Agreed
- one bullet per cluster of size >= 2 (multiple authors converged)
- end each bullet with one or more [Author, dump-id] citations from the cluster's attribution

## Disputed
- one bullet per contradiction edge
- quote BOTH sides in their author's voice with [Author, dump-id] citations

## Move forward
- one bullet per "deliverable"-typed idea that has cluster support and no attached contradiction
- end with [Author, dump-id] citation

Hard rules:
- Every bullet must end with at least one [Author, dump-id] citation in that exact format
- Author is the human display name (e.g. "Alice"), exactly as it appears in the attribution's "author" field — never a UUID.
- dump-id is the FULL string in the attribution's "dump_id" field including any timestamp suffix — copy it verbatim, do not truncate.
- Use the verbatim_quote from attribution where you reference the dump
- Output the markdown directly. No preamble, no JSON, no code fences around the document.
`;

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

  let lastBody = "";
  let lastComplaints: string[] = [];
  let priorComplaints: string[] | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userMsg =
      attempt === 0
        ? `${RENDER_INSTRUCTIONS}\n\n<context>\n${compact}\n</context>`
        : `${RENDER_INSTRUCTIONS}\n\n<context>\n${compact}\n</context>\n\n<previous-output>\n${lastBody}\n</previous-output>\n\n<repair>\nThe previous output had these citation problems:\n${lastComplaints.join("\n- ")}\nFix them and re-emit the full document.\n</repair>`;
    const body = await input.service.runToString({
      persona_id: "synthesis",
      messages: [{ role: "user", content: userMsg }],
    });
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
