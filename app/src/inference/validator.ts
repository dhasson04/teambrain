import { listDumps } from "../vault/dumps";
import { parseFrontmatter } from "../vault/fs-utils";

export interface CitationRef {
  author: string;
  dump_id: string;
  index: number;
  raw: string;
}

export interface CitationComplaint {
  citation: CitationRef;
  reason: string;
}

export interface ValidationResult {
  ok: boolean;
  citations: CitationRef[];
  complaints: CitationComplaint[];
  /** A human-readable repair instruction the renderer can re-prompt with. */
  repairInstruction?: string;
}

const CITATION_RE = /\[([^,\]]+),\s*([A-Za-z0-9._-]+)\]/g;

export function parseCitations(markdown: string): CitationRef[] {
  const out: CitationRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(markdown)) !== null) {
    out.push({ author: m[1]!.trim(), dump_id: m[2]!, index: m.index, raw: m[0] });
  }
  return out;
}

export interface ValidateInput {
  markdown: string;
  project: string;
  sub: string;
  /** Require at least one citation per non-empty bullet line. Default true. */
  requirePerBullet?: boolean;
}

interface DumpIndexEntry {
  id: string;
  author: string;
  body: string;
}

async function buildDumpIndex(project: string, sub: string): Promise<Map<string, DumpIndexEntry>> {
  const dumps = (await listDumps(project, sub, { includeBody: true })) as Array<{
    id: string;
    author: string;
    body: string;
  }>;
  const index = new Map<string, DumpIndexEntry>();
  for (const d of dumps) {
    const { body } = parseFrontmatter(d.body);
    index.set(d.id, { id: d.id, author: d.author, body: body.trim() });
  }
  return index;
}

interface BulletLine {
  /** Trimmed line content. */
  line: string;
  /** 1-indexed line number within the document. */
  lineNumber: number;
  /** Inclusive start char-index of the raw (untrimmed) line in the document. */
  start: number;
  /** Exclusive end char-index of the raw line (not including the trailing newline). */
  end: number;
}

/**
 * Walk the markdown once, recording each bullet line's EXACT char-index range.
 *
 * The previous implementation stored only the trimmed content and later used
 * `markdown.indexOf(trimmedLine)` to recover position, which returns the FIRST
 * occurrence and silently assigns the wrong window to any bullet whose text
 * happens to appear as a substring of an earlier line. That broke the
 * requirePerBullet check for real renderer outputs where two bullets in
 * Disputed shared long prefixes. Using the line-walk positions here makes
 * every bullet's citation window deterministic regardless of document content.
 */
function bulletLines(markdown: string): BulletLine[] {
  const out: BulletLine[] = [];
  let cursor = 0;
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const start = cursor;
    const end = cursor + raw.length;
    // Advance cursor past this line plus its newline. We can't perfectly
    // distinguish "\n" vs "\r\n" here without re-scanning, so sniff the
    // character at `end` in the original markdown.
    const nl = markdown[end] === "\r" && markdown[end + 1] === "\n" ? 2 : markdown[end] === "\n" ? 1 : 0;
    cursor = end + nl;
    const trimmed = raw.trim();
    if (trimmed.startsWith("- ") && trimmed.length > 4) {
      out.push({ line: trimmed, lineNumber: i + 1, start, end });
    }
  }
  return out;
}

export async function validateCitations(input: ValidateInput): Promise<ValidationResult> {
  const requirePerBullet = input.requirePerBullet ?? true;
  const index = await buildDumpIndex(input.project, input.sub);
  const citations = parseCitations(input.markdown);
  const complaints: CitationComplaint[] = [];

  const dumpIds = [...index.keys()];

  for (const c of citations) {
    let dump = index.get(c.dump_id);

    // Prefix tolerance: small models routinely strip the timestamp suffix
    // and emit just the profile-uuid prefix of the real dump-id. If the
    // cited id is a unique prefix of exactly one real dump-id, normalize
    // and accept. If it's a prefix of multiple, emit an actionable
    // "ambiguous prefix" complaint with the candidates listed.
    if (!dump) {
      // Suffix tolerance: defensive — kept even after T002 enum-pins dump_id
      // at the sampler, because ollama/ollama#15260 reports GBNF enum leakage
      // under long-context render prompts where the model occasionally emits
      // an off-enum `<dump_id>-iN` idea-id. Strip a trailing `-iN` and retry.
      const suffixStripped = c.dump_id.replace(/-i\d+$/, "");
      if (suffixStripped !== c.dump_id) {
        dump = index.get(suffixStripped);
      }
    }
    if (!dump) {
      const prefixMatches = dumpIds.filter((id) => id.startsWith(c.dump_id) && id !== c.dump_id);
      if (prefixMatches.length === 1) {
        dump = index.get(prefixMatches[0]!);
      } else if (prefixMatches.length > 1) {
        complaints.push({
          citation: c,
          reason: `ambiguous prefix "${c.dump_id}" matches multiple dump-ids: ${prefixMatches.join(", ")}. Use the full dump-id from the attribution field.`,
        });
        continue;
      } else {
        complaints.push({ citation: c, reason: `dump-id "${c.dump_id}" does not exist in this subproject` });
        continue;
      }
    }
    if (!dump) continue;

  }

  if (requirePerBullet) {
    const bullets = bulletLines(input.markdown);
    for (const b of bullets) {
      // A bullet is "cited" iff at least one citation's `[` character falls
      // strictly inside that bullet's char-index range. No substring search,
      // no ±200 char slop — position is derived from the line walk and cannot
      // be confused by identical or prefix-shared bullet text elsewhere.
      const hasCitation = citations.some((c) => c.index >= b.start && c.index < b.end);
      if (!hasCitation) {
        complaints.push({
          citation: { author: "", dump_id: "", index: -1, raw: b.line },
          reason: `bullet on line ${b.lineNumber} lacks a [Author, dump-id] citation`,
        });
      }
    }
  }

  const ok = complaints.length === 0;
  return {
    ok,
    citations,
    complaints,
    repairInstruction: ok
      ? undefined
      : `Fix the following citation problems and re-emit the full document:\n${complaints
          .map((c, i) => `${i + 1}. ${c.reason}`)
          .join("\n")}`,
  };
}
