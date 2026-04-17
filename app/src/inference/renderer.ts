import { readIdeasBundle } from "../vault/ideas";
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
- Use the verbatim_quote from attribution where you reference the dump
- Output the markdown directly. No preamble, no JSON, no code fences around the document.
`;

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
      attribution: bundle.attribution,
    },
    null,
    2,
  );

  let lastBody = "";
  let lastComplaints: string[] = [];
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
  }
  return { ok: false, body: lastBody, attempts: maxRetries + 1, validatorComplaints: lastComplaints };
}
