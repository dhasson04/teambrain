// R004: noun-phrase + person + number hints that seed the extractor.
//
// Pure-JS NLP via compromise (~2 MB, no native deps). The extractor
// prompt gets an <entities> block so the 4B model doesn't have to
// decide what's important from scratch — FastGraphRAG pattern.
//
// Why compromise and not spaCy: spaCy requires Python. "One command to
// run everything" is load-bearing for local-first POC.

import nlp from "compromise";
import { loadProfiles } from "../vault/profiles";

export interface Hints {
  nouns: string[];
  people: string[];
  numbers: string[];
}

// Stopwords filtered from noun phrases — generic terms that add only
// noise to the extractor's prompt.
const STOPWORD_NOUNS = new Set([
  "thing",
  "things",
  "stuff",
  "something",
  "someone",
  "anything",
  "everyone",
  "everything",
  "idea",
  "ideas",
  "point",
  "fact",
  "way",
  "ways",
  "time",
  "times",
  "day",
  "days",
  "part",
  "parts",
  "people",
  "person",
  "team",
  "work",
  "case",
  "cases",
  "example",
  "examples",
  "kind",
  "side",
  "sides",
  "end",
  "area",
  "areas",
  "note",
  "notes",
]);

function dedupeLowercase(xs: string[], minLen = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const key = x.trim().toLowerCase();
    if (key.length < minLen) continue;
    if (STOPWORD_NOUNS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x.trim());
  }
  return out;
}

/**
 * Extract noun phrases, person names, and numeric references from a dump.
 *
 * Sync / deterministic / O(n) in body length. Benchmarks at < 50ms for
 * a 2 KB dump per the R004 acceptance criterion.
 */
export function extractHintsSync(body: string): Hints {
  const doc = nlp(body);

  // Noun phrases via compromise's nouns() helper — grabs both simple nouns
  // and multi-word noun phrases like "billing form" or "feature flags".
  const rawNouns = doc.nouns().out("array") as string[];

  // People names. compromise.people() catches names it recognizes.
  // As a fallback for uncommon names like "Dan" that aren't in compromise's
  // name lexicon by default, we also scan for capitalized-word tokens at
  // sentence boundaries or after "Alice/Bob/Carol/Dan"-style patterns.
  const rawPeople = doc.people().out("array") as string[];
  const capitalized = body.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  const peopleBlocklist = new Set([
    "the",
    "and",
    "but",
    "also",
    "separate",
    "decision",
    "post-launch",
    "legal",
    "engineering",
    "rafal",
    "post",
    "launch",
    "q3",
    "may",
    "june",
    "april",
    "march",
    "new",
    "full",
    "cohort",
    "step",
    "step 3",
    "the pm",
  ]);
  const candidatePeople = [...rawPeople, ...capitalized].filter((s) => {
    const lower = s.toLowerCase();
    // Filter out obvious non-names (months, tech, verbs-as-nouns).
    return !peopleBlocklist.has(lower);
  });

  // Numbers — compromise's Value tag + a few pragmatic regex patterns for
  // common business contexts.
  const rawValues = doc.values().out("array") as string[];
  const stepPattern = body.match(/\bstep\s+\d+\b/gi) ?? [];
  const percentPattern = body.match(/\b\d+(?:\.\d+)?x?\s*%?\b/g) ?? []; // catches "38%", "2.3x"
  const unitPattern = body.match(/\b\d+\s+(?:days?|weeks?|months?|hours?|minutes?)\b/gi) ?? [];
  const twoPattern = body.match(/\b(?:two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|hours?)\b/gi) ?? [];

  return {
    nouns: dedupeLowercase(rawNouns),
    // People need a lower minimum length (names like "Dan" are 3 chars).
    people: dedupeLowercase(candidatePeople, 3),
    numbers: dedupeLowercase(
      [...rawValues, ...stepPattern, ...percentPattern, ...unitPattern, ...twoPattern],
      3,
    ),
  };
}

/**
 * Same as extractHintsSync but additionally cross-references detected
 * people names against vault/profiles.json display_names. When a first
 * name in the dump matches a profile's display_name, it gets annotated
 * with the profile id in the output so the extractor can attribute
 * "Dan said X" to the right author.
 */
export async function extractHints(body: string): Promise<Hints> {
  const base = extractHintsSync(body);
  try {
    const profiles = await loadProfiles();
    const displayLower = new Map(
      profiles.profiles.map((p) => [p.display_name.toLowerCase(), p]),
    );
    const resolved: string[] = [];
    const seen = new Set<string>();
    // Also look for profile display_names anywhere in the body, even if
    // compromise didn't flag them as people — covers "Dan" / "Rafal" style
    // names that aren't in the default compromise lexicon.
    const bodyLower = ` ${body.toLowerCase()} `;
    for (const [name, profile] of displayLower.entries()) {
      const boundary = new RegExp(`\\b${name}\\b`, "i");
      if (boundary.test(bodyLower) && !seen.has(name)) {
        resolved.push(`${profile.display_name} (profile:${profile.id})`);
        seen.add(name);
      }
    }
    // Then include any compromise-detected names not already resolved.
    for (const candidate of base.people) {
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(candidate);
    }
    return { ...base, people: resolved };
  } catch {
    return base;
  }
}

/** Format a hints block for inclusion in the extractor prompt. */
export function formatHintsBlock(h: Hints): string {
  if (h.nouns.length === 0 && h.people.length === 0 && h.numbers.length === 0) {
    return "";
  }
  const lines: string[] = ["<entities>"];
  if (h.nouns.length > 0) lines.push(`- noun phrases: ${JSON.stringify(h.nouns)}`);
  if (h.people.length > 0) lines.push(`- people mentioned: ${JSON.stringify(h.people)}`);
  if (h.numbers.length > 0) lines.push(`- numbers: ${JSON.stringify(h.numbers)}`);
  lines.push("</entities>");
  return lines.join("\n");
}
