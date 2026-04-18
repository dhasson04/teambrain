import { z } from "zod";
import { listDumps } from "../vault/dumps";
import { parseFrontmatter } from "../vault/fs-utils";
import { IdeaTypeSchema, type IdeaType } from "../vault/ideas";
import { loadConfig } from "../server/config";
import {
  diffByHash,
  type DumpHashEntry,
  readLastSynthInput,
} from "../vault/synthesis";
import { extractHints, formatHintsBlock } from "./hints";
import type { InferenceService } from "./inference-service";

/**
 * Normalize a string for fuzzy evidence_quote matching. Small local models
 * (gemma3:4b) normalize whitespace and quotes when echoing text, so byte-exact
 * substring checks drop 95%+ of ideas. We accept the match if the normalized
 * quote is a substring of the normalized body.
 */
function normalizeForMatch(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
    .toLowerCase();
}

function quoteMatchesBody(quote: string, body: string): boolean {
  if (body.includes(quote)) return true;
  const nq = normalizeForMatch(quote);
  if (nq.length === 0) return false;
  return normalizeForMatch(body).includes(nq);
}

export const ExtractedIdeaSchema = z.object({
  statement: z.string().trim().min(1),
  type: IdeaTypeSchema,
  evidence_quote: z.string().trim().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ExtractedIdea = z.infer<typeof ExtractedIdeaSchema>;

export const ExtractionResponseSchema = z.object({
  ideas: z.array(ExtractedIdeaSchema),
});

export interface AttributedIdea extends ExtractedIdea {
  dump_id: string;
  author: string;
}

export interface ExtractionEvent {
  type: "extracting" | "cached" | "extracted" | "skipped" | "error";
  dump_id: string;
  status?: string;
  ideas?: AttributedIdea[];
  message?: string;
}

const EXTRACTION_INSTRUCTIONS = `
Extract ideas from the brain dump below. Return strict JSON of shape:
{
  "ideas": [
    { "statement": "...", "type": "theme|claim|proposal|concern|question|deliverable", "evidence_quote": "verbatim substring of the dump", "confidence": 0.0-1.0 }
  ]
}

The evidence_quote MUST be a verbatim substring of the dump's body — copy exact characters including punctuation. Do not paraphrase.

Type definitions:
- theme: a recurring subject the dump returns to
- claim: an assertion the author believes is true
- proposal: a suggested action or design
- concern: a worry or risk the author raised
- question: an open question the author surfaced
- deliverable: a concrete next-step the team could ship

Drop any idea you cannot ground in a verbatim quote.
`;

// R001: JSON Schema passed to Ollama's `format` field. The `type` field
// is enum-constrained to the six IdeaTypeSchema values so the model
// cannot emit anything else at the sampler level.
const EXTRACTION_FORMAT = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string", minLength: 1 },
          type: {
            type: "string",
            enum: ["theme", "claim", "proposal", "concern", "question", "deliverable"],
          },
          evidence_quote: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["statement", "type", "evidence_quote", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

export interface ExtractDumpInput {
  service: InferenceService;
  dumpId: string;
  author: string;
  body: string;
  maxRetries?: number;
}

/**
 * Extract ideas from a single dump body. Asks the synthesis persona in JSON mode,
 * validates that every evidence_quote is a substring of the dump body, and
 * re-prompts up to maxRetries times to fix bad quotes.
 */
export async function extractFromDump(input: ExtractDumpInput): Promise<AttributedIdea[]> {
  const cfg = loadConfig();
  const maxRetries = input.maxRetries ?? cfg.extract_max_retries ?? 2;
  // R004: pre-extract hints deterministically. Gated by feature flag so
  // the legacy no-hints path stays reachable during rollout.
  let hintsBlock = "";
  if (cfg.features?.hint_block_in_extractor !== false) {
    try {
      const hints = await extractHints(input.body);
      hintsBlock = formatHintsBlock(hints);
    } catch {
      // Never let a hints failure block extraction.
      hintsBlock = "";
    }
  }
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userMsg = `${EXTRACTION_INSTRUCTIONS}\n\n<dump author="${input.author}" id="${input.dumpId}">\n${input.body}\n</dump>${
      hintsBlock ? `\n\n${hintsBlock}` : ""
    }${attempt > 0 ? `\n\n<retry note>${lastError}</retry>` : ""}`;
    const raw = await input.service.runToString({
      persona_id: "synthesis",
      // R001: structured `format` supersedes the legacy `json: true` flag.
      // Shape errors become impossible at the sampler; remaining retries
      // handle only the semantic `evidence_quote` substring check.
      format: EXTRACTION_FORMAT,
      messages: [{ role: "user", content: userMsg }],
    });
    let parsed: { ideas: ExtractedIdea[] };
    try {
      parsed = ExtractionResponseSchema.parse(JSON.parse(raw));
    } catch (e) {
      // Should be near-impossible now that sampler enforces the schema.
      // Kept as a belt-and-suspenders guard; log for visibility.
      lastError = `JSON parse / schema validation failed: ${(e as Error).message}. Output strict JSON.`;
      continue;
    }
    const valid: AttributedIdea[] = [];
    const invalid: ExtractedIdea[] = [];
    for (const idea of parsed.ideas) {
      if (quoteMatchesBody(idea.evidence_quote, input.body)) {
        // R006 (partial): confidence derived deterministically from the
        // ratio of evidence_quote length to statement length. LLM-assigned
        // confidence on 4B models is ~random noise; the ratio is a weak
        // but reproducible proxy for "how grounded is this claim in the
        // actual dump text."
        //
        // NOTE: the full R006 spec called for splitting extract into two
        // calls (extract → classify) to narrow each LLM task. With the
        // T002 grammar-constraint lands the enum-typed `type` field is
        // already reliable, so a separate classify call would double
        // round-trips for near-zero marginal quality gain. Deferred to a
        // follow-up if empirical type-accuracy on Fixture B proves the
        // overloaded extract call isn't good enough.
        const derivedConfidence = Math.max(
          0.3,
          Math.min(1.0, idea.evidence_quote.length / Math.max(1, idea.statement.length)),
        );
        const featuresEnabled = cfg.features?.pipeline_decomp !== false;
        valid.push({
          ...idea,
          confidence: featuresEnabled ? derivedConfidence : idea.confidence,
          dump_id: input.dumpId,
          author: input.author,
        });
      } else {
        invalid.push(idea);
      }
    }
    if (invalid.length === 0) return valid;
    if (attempt === maxRetries) {
      // Last attempt — return whatever was valid, drop the rest.
      return valid;
    }
    lastError = `${invalid.length} ideas had an evidence_quote that did not appear in the dump (even after whitespace / quote normalization). Copy exact phrases from the dump body.`;
  }
  return [];
}

export interface ExtractAllInput {
  service: InferenceService;
  project: string;
  sub: string;
  /** Force re-extraction of every dump, ignoring chunk-hash cache. */
  forceAll?: boolean;
}

/**
 * Run extraction across every changed dump in a subproject. Yields SSE-shaped
 * events so callers can pipe straight to the HTTP layer in T011.
 */
export async function* extractAll(
  input: ExtractAllInput,
): AsyncGenerator<ExtractionEvent, AttributedIdea[]> {
  const dumps = (await listDumps(input.project, input.sub, { includeBody: true })) as Array<{
    id: string;
    author: string;
    body: string;
    hash: string;
  }>;
  const last = await readLastSynthInput(input.project, input.sub);
  const current: DumpHashEntry[] = dumps.map((d) => ({ dump_id: d.id, hash: d.hash }));
  const diff = diffByHash(current, last);
  const changedSet = new Set<string>([...diff.added, ...diff.changed]);
  const results: AttributedIdea[] = [];
  for (const d of dumps) {
    if (!input.forceAll && !changedSet.has(d.id)) {
      yield { type: "cached", dump_id: d.id };
      continue;
    }
    yield { type: "extracting", dump_id: d.id, status: "running" };
    try {
      const { body } = parseFrontmatter(d.body); // strip frontmatter from body
      const ideas = await extractFromDump({
        service: input.service,
        dumpId: d.id,
        author: d.author,
        body: body.trim(),
      });
      results.push(...ideas);
      yield { type: "extracted", dump_id: d.id, ideas };
    } catch (e) {
      yield { type: "error", dump_id: d.id, message: (e as Error).message };
    }
  }
  return results;
}
