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

function bulletsRequiringCitation(markdown: string): { line: string; lineNumber: number }[] {
  const lines = markdown.split(/\r?\n/);
  const out: { line: string; lineNumber: number }[] = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") && trimmed.length > 4) {
      out.push({ line: trimmed, lineNumber: i + 1 });
    }
  });
  return out;
}

export async function validateCitations(input: ValidateInput): Promise<ValidationResult> {
  const requirePerBullet = input.requirePerBullet ?? true;
  const index = await buildDumpIndex(input.project, input.sub);
  const citations = parseCitations(input.markdown);
  const complaints: CitationComplaint[] = [];

  for (const c of citations) {
    const dump = index.get(c.dump_id);
    if (!dump) {
      complaints.push({ citation: c, reason: `dump-id "${c.dump_id}" does not exist in this subproject` });
      continue;
    }
    if (dump.author.toLowerCase() !== c.author.toLowerCase()) {
      complaints.push({
        citation: c,
        reason: `author mismatch: citation says "${c.author}" but dump ${c.dump_id} was authored by "${dump.author}"`,
      });
    }
  }

  if (requirePerBullet) {
    const bullets = bulletsRequiringCitation(input.markdown);
    for (const b of bullets) {
      const hasCitation = citations.some(
        (c) => c.index >= input.markdown.indexOf(b.line) && c.index < input.markdown.indexOf(b.line) + b.line.length + 200,
      );
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
