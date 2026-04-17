import { listDumps } from "../vault/dumps";
import { parseFrontmatter } from "../vault/fs-utils";
import { loadProfiles } from "../vault/profiles";

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

  // Resolve author display_name ↔ profile id so citations can be written in
  // either form. After backprop-2 the renderer emits display_names; the
  // validator must still accept legacy UUID-style authors too.
  const profiles = await loadProfiles();
  const displayByUuid = new Map(profiles.profiles.map((p) => [p.id, p.display_name]));

  const dumpIds = [...index.keys()];

  for (const c of citations) {
    let dump = index.get(c.dump_id);

    // Prefix tolerance: small models routinely strip the timestamp suffix
    // and emit just the profile-uuid prefix of the real dump-id. If the
    // cited id is a unique prefix of exactly one real dump-id, normalize
    // and accept. If it's a prefix of multiple, emit an actionable
    // "ambiguous prefix" complaint with the candidates listed.
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

    const authorDisplay = displayByUuid.get(dump.author) ?? dump.author;
    const citedAuthor = c.author.toLowerCase();
    if (
      dump.author.toLowerCase() !== citedAuthor &&
      authorDisplay.toLowerCase() !== citedAuthor
    ) {
      complaints.push({
        citation: c,
        reason: `author mismatch: citation says "${c.author}" but dump ${dump.id} was authored by "${authorDisplay}"`,
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
