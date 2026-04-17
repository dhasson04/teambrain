# Teambrain pipeline quality — research + fix plan

**Author:** research synthesis pass, 2026-04-17
**Audience:** Lucas, deciding what to build next
**Source observation:** deep-dive deck at `presentation-deep-dive/` (slide 11 "Materials never reach the LLM", slide 12 "FailureModes", slide 16 "WhatsNext")

---

## 0. Thesis in three sentences

The 4B-parameter local model is being asked to do three jobs it's bad at — free-form extraction, cross-dump clustering, and cross-dump contradiction spotting — in a single chain of prompts. Each of those jobs has a much smaller, more deterministic, better-studied solution that doesn't require an LLM at all. **The move is to push the LLM out of the decisions where it's a liability and into the one place it's genuinely irreplaceable: turning a structured artifact back into prose.**

After the refactor, the LLM handles:
- (still) per-dump idea extraction, but with a **grammar-constrained output** it cannot violate
- (new, only) final rendering of already-clustered, already-contradiction-flagged structured data into markdown

The LLM stops handling:
- cluster assignment (delegated to embeddings + HDBSCAN)
- contradiction detection (delegated to an NLI cross-encoder)
- which materials/problem-statement sections to include (delegated to contextual retrieval)
- entity normalization (delegated to spaCy noun-phrase extraction)

**Expected quality delta:** clusters that are actually right, contradictions that are actually contradictions, a renderer that cannot invent section names, and materials that actually influence the output. All without changing the model.

---

## 1. What "poor output" meant concretely (baseline)

From the 2026-04-17 smoke test, reference inputs (3 dumps ~1 KB each) on gemma3:4b Q4_K_M:

| Stage | What happened | Evidence |
|---|---|---|
| Extract (before backprop) | 0 ideas from 2 of 3 dumps | `ideas.json` snapshot, Bob and Carol empty |
| Extract (after backprop-1 fuzzy fix) | 6 ideas total: lcuasduys 1, bob 4, carol 1 | present `ideas.json` |
| Merge | 0 clusters assigned, 0 contradictions flagged — every idea has `cluster_id: null` | `ideas.json` verbatim |
| Render (before backprop-2) | 3/3 validator failures with identical "dump-id does not exist" complaint | SSE error stream, captured in bug report |
| Render (after backprop-2) | Writes successfully but model renames `## Disputed` → `## Concerns`, no `## Move forward` section | `synthesis/latest.md` |
| Materials / problem.md | Zero effect on output — never sent to the LLM (pipeline grep shows 0 references from `app/src/inference/`) | deep-dive slide 11 |

The two failures that remain after the backprop batch are **the merger returning null clusters** and **the renderer renaming sections**. Both are instances of the same underlying problem: asking a 4B model to do structural reasoning it isn't reliable at.

---

## 2. The design principle

> **The LLM should be a composer, not a builder.**
> Every structural decision we can make with code is a decision we don't have to hope the model makes correctly. The LLM's job is the last-mile: turning a structured artifact back into human prose. Everything upstream — grouping similar things, spotting opposing things, matching the right context — is a search-and-structure problem, not a language problem.

This isn't novel. It's how Microsoft built GraphRAG's "fast" variant, how Anthropic's contextual-retrieval paper framed their fix, how BERTopic framed topic modeling five years ago. The industry has been moving this direction for a while. Teambrain is just currently on the wrong side of it for its target hardware.

The principle cashes out as six concrete leverage points below.

---

## 3. Six leverage points, ranked by quality-per-effort

Each entry: what it is, why it exists, how it maps to Teambrain, rough effort, rough quality impact.

### A. Constrained decoding for extraction output

**What.** Instead of prompting the model to emit JSON in a specific schema and hoping, force the sampler at each token step to only allow tokens that keep the output grammatically valid per a schema. Also known as GBNF in llama.cpp / Ollama, or "Structured Outputs" via Ollama's `format` parameter.

**Why it works.** The model can no longer emit malformed JSON, invalid enum values, or extra commentary. The LLM's hypothetical next-token distribution gets masked by the grammar and renormalized each step. *The model cooperates by construction, not by prompting.*

Performance data: "constrained decoding can guarantee precise outputs, even when working with relatively weak models applied to complex tasks" ([Constrained Decoding Guide — Aidan Cooper](https://www.aidancooper.co.uk/constrained-decoding/)). Ollama supports this via `format: <JSON-schema>` ([Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)).

**How in Teambrain.** The extractor already parses output with `ExtractionResponseSchema` (Zod). We're doing schema validation *after* the model has generated, then retrying. Replace that with:
- Pass a JSON-schema `format` to the Ollama `/api/chat` call at `app/src/inference/inference-service.ts`. The schema is: `{ ideas: [{ statement, type: enum, evidence_quote, confidence }] }` with `type` constrained to the six-value enum that already exists in `vault/ideas.ts`.
- Remove the retry loop entirely. Or keep one retry specifically for the semantic "evidence_quote must match body" check (still needs post-validation) but not for shape errors.
- Same for the merger call in `merger.ts` and the renderer call in `renderer.ts`. Even the renderer's *markdown* output can be constrained: `format` must allow exactly three `## Section` headers named `Agreed | Disputed | Move forward`, each followed by ≥ 0 bullet lines ending in `[Author, dump-id]`. This **structurally eliminates** the `## Concerns` drift observed in the smoke test.

**Gotcha.** Gemma 4 has been reported to enter token-repetition loops under grammar-constrained generation on free-text string fields ([ollama/ollama#15502](https://github.com/ollama/ollama/issues/15502)). Gemma 3 doesn't have this bug. Stay on gemma3:4b for now; revisit before any model bump.

**Effort:** S (2-4 hours). One file change to pass `format` on each call, one change to thin the retry loops, write a test that asserts the format is passed.

**Impact:** High. Eliminates an entire class of current failures (invalid JSON, wrong enum values, renderer drifting to "## Concerns"). Saves tokens too, because the model stops emitting scaffolding characters.

---

### B. Embedding-based clustering (replace the LLM merge pass entirely)

**What.** Swap the current "ask gemma3:4b to return clusters + contradictions + edges as JSON" single-call merge for a deterministic pipeline: embed each idea's statement as a dense vector → reduce dims → density-cluster. This is the exact BERTopic pattern ([BERTopic algorithm](https://maartengr.github.io/BERTopic/algorithm/algorithm.html)).

**Why it works.** Clustering is a search/geometry problem. The current merge call is asking the model to solve it via token prediction — which is why the 2026-04-17 run produced zero clusters. Embeddings trained explicitly for semantic similarity (like `all-MiniLM-L6-v2`, 22M params, 80 MB on disk) beat a 4B decoder at this *by several orders of magnitude per compute unit*.

Quantitative baseline: MiniLM-L6-v2 with `@huggingface/transformers` (Xenova's ONNX port) runs ~25 ms per short sentence on CPU, 2-5× faster with int8 quantization ([all-MiniLM-L6-v2 HF](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2); [Xenova port](https://huggingface.co/Xenova/all-MiniLM-L6-v2)). For 50 ideas that's ~1.2 seconds total vs. ~17-44 seconds for an LLM merge call on the A1000.

**How in Teambrain.**

1. Add `@xenova/transformers` (now `@huggingface/transformers`) as a Bun dep. Bun can run ONNX via the JS bindings; no Python needed, no new runtime, no GPU needed.

2. In `app/src/inference/`, add an `embeddings.ts` module:
   ```ts
   // pseudo
   import { pipeline } from '@huggingface/transformers';
   let extractor: any;
   export async function embed(texts: string[]): Promise<number[][]> {
     extractor ??= await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
     const out = await extractor(texts, { pooling: 'mean', normalize: true });
     return out.tolist();
   }
   ```

3. Replace `mergeIdeas()` in `merger.ts`:
   - For each of the N extracted ideas, embed its `statement` + (optionally) its `evidence_quote` — concatenated. Gives an N×384 matrix.
   - Cluster with a simple **agglomerative** approach at a fixed cosine-similarity threshold (e.g. 0.72). For a POC with < 50 ideas this is trivial to implement in ~30 lines without an external lib and avoids HDBSCAN's min-cluster-size issue at small N. At scale (100+ ideas), swap in HDBSCAN via a Node binding or offload to a sidecar.
   - A cluster of size ≥ 2 with ideas from ≥ 2 distinct authors **is** an agreement signal. Set `cluster_id` accordingly, write it to `ideas.json`. Deterministic, reproducible, no null-cluster failure mode.

4. Write each cluster's member_idea_ids list to `connections.json` as `kind: "agree"` edges. The graph visualization in `ConnectionsTab` already expects this.

**Alternative considered & rejected:** use a second LLM call on pre-filtered pairs to decide clustering. Rejected because it keeps the 4B model in the structural-decision seat — the exact failure mode we're trying to eliminate.

**Effort:** M (1-2 days). Biggest chunk is adding the embedding dependency cleanly and writing a decent agglomerative clusterer with unit tests on fixtures.

**Impact:** Very high. Fixes the current null-cluster-everywhere bug, makes the Connections graph actually show connections, removes ~17 seconds from the pipeline per run, and the result becomes deterministic (same inputs → same clusters).

---

### C. NLI cross-encoder for contradiction detection

**What.** Use a pretrained Natural Language Inference model to classify every cross-author idea pair as `entailment | neutral | contradiction`. For Teambrain, the relevant pair is "idea I says A" × "idea J says B" — where I.author ≠ J.author.

**Why it works.** NLI is a 7-year-old well-studied classification task with strong, small models. `cross-encoder/nli-deberta-v3-small` is 100M params, scores 91.7% on SNLI and 87.5% on MNLI, outputs `[contradiction, entailment, neutral]` probability scores directly ([HF model card](https://huggingface.co/cross-encoder/nli-deberta-v3-small)). An even smaller variant, `nli-deberta-v3-xsmall`, fits in ~140 MB.

Compared to asking gemma3:4b "are ideas A and B contradictory?" — the NLI model is *trained specifically for this*, and its output is a calibrated probability, not a token sequence we have to parse.

**How in Teambrain.**

1. After clustering (leverage B), take every pair of ideas `(I, J)` where `I.author ≠ J.author` AND they're in different clusters (intra-cluster contradiction is unlikely by construction).

2. Run the NLI model on `(I.statement, J.statement)`. Call it a contradiction only when:
   - `P(contradiction) > 0.6` AND
   - `P(contradiction) > P(entailment) + 0.2` (margin guard to avoid coin-flip classifications)

3. Write qualifying pairs as `kind: "contradict"` edges in `connections.json`, with `reason` populated by a tiny LLM sub-call *only on the confirmed pairs* (1 call per real contradiction, not N²). The LLM is fine at "summarize why A and B conflict" when the contradiction is already established.

**Compute profile.** For 50 ideas, ~500 cross-author pairs × ~50 ms per pair on CPU = ~25 seconds of NLI. Acceptable because it runs once per synthesis, in parallel with rendering.

**Alternative considered:** fine-tune a small classifier on team-specific data. Rejected for POC — cold-start data cost is too high.

**Effort:** M (1-2 days), overlapping with B because both use the same transformers.js runtime.

**Impact:** High. Current merger is returning zero contradictions on obvious opposing claims ("defer billing to step 5" vs "delay billing resolves the funnel" in the 2026-04-17 run). NLI will catch these.

---

### D. Noun-phrase / entity preprocessing (the FastGraphRAG pattern)

**What.** Before sending dumps to the LLM, extract named entities and noun phrases deterministically. Feed them as *structured hints* alongside the dump body. This is the approach Microsoft's FastGraphRAG takes: entity extraction becomes noun-phrase extraction via spaCy/NLTK, and relationships become text-unit co-occurrence between entity pairs. No LLM reasoning for those steps ([GraphRAG methods](https://microsoft.github.io/graphrag/index/methods/)).

**Why it works.** When the LLM is given `<dump>` alone it has to decide what's important. When it's given `<dump> + <pre-extracted entities: ["billing", "step 3", "A/B test", "small-business cohort"]>`, it has a scaffold. The 4B model is much better at *elaborating* a scaffold than *building* one.

**How in Teambrain.**

1. JS options for noun-phrase extraction (no Python):
   - **compromise.js** — pure JS, 2 MB, extracts people/places/topics/nouns. Good enough for this.
   - **wink-nlp** — similar, faster, also JS-native.
   - Either one runs in Bun without native deps.

2. Per dump, pre-extract:
   - Noun phrases (candidate entities: "credit-card form", "A/B test", "feature flags")
   - People named in the dump (Alice, Bob, Carol, Dan — auto-resolved against `vault/profiles.json` where names match)
   - Numerical references ("step 3", "38%", "Friday")

3. Include these in the extractor prompt under a `<hints>` block:
   ```
   <dump author="bob" id="...">
     {body}
   </dump>
   <hints>
     entities: ["feature flags", "soft path branch", "credit-card form", "A/B test", "small-business cohort", "Dan"]
     numbers: ["two days", "step 3"]
   </hints>
   ```

4. The LLM's prompt stays unchanged otherwise. The hint block costs ~30-80 extra tokens and dramatically improves recall on small models.

**Effort:** S (3-6 hours). Add the lib, write a simple extractor function, plumb the hints into the extractor prompt.

**Impact:** Medium-high. This is the cheapest win after grammar-constrained decoding and it improves extract recall further, on top of the backprop-1 fuzzy-match fix.

---

### E. Materials + problem.md → contextual retrieval (fixes the "Big Lie")

**What.** Wire the two input surfaces that the LLM currently never sees into the pipeline. But do it with the Anthropic contextual-retrieval pattern, not by dumping everything into the prompt.

**Why the context matters.** Per the deep-dive deck slide 11: currently `readProblem` and `listMaterials` are only called by server routes and the UI, never by `extractor.ts` / `merger.ts` / `renderer.ts`. The kickoff meeting transcript pasted during the smoke test had zero effect on output.

**Why not just prepend everything.** A 4KB materials file + 500-char problem.md × 3 dumps blows gemma3:4b's effective context. We need to fetch the relevant slice per extract/render call.

**How Anthropic does it.** Preprocess each chunk with a cheap LLM call to prepend a 50-100 token "contextualization" explaining where the chunk sits in the document. Then index both a semantic-embedding and a BM25 index. At query time, hybrid-retrieve top candidates, rerank, feed top-K to the generator. Measured: combining Contextual Embeddings + Contextual BM25 cut retrieval failure rate by 49% (5.7% → 2.9%), adding reranking pushed it to 67% (5.7% → 1.9%) ([Anthropic blog](https://www.anthropic.com/news/contextual-retrieval)).

**How in Teambrain (scoped for POC).**

1. Chunk `problem.md` and each `materials/*.md` into ~300-token pieces. Realistically most teams' problem statements + a single meeting transcript fit in one or two chunks — this may be overkill. Start simple: one chunk per material file.

2. Use the same `all-MiniLM-L6-v2` from leverage B. Embed every chunk once; persist to `vault/projects/.../subprojects/.../.cache/materials-index.json`. Invalidate on file-mtime change.

3. Retrieval phase: before the render call, build a query embedding from the concatenated idea statements for this subproject. Cosine-search the materials index. Take top-3 chunks. Total retrieved context budget: ~1 KB.

4. Prepend to the render prompt as `<project-context>` block:
   ```
   <project-context>
     problem: <problem.md excerpt, max 300 tokens>
     relevant-material (kickoff-meeting-2026-02-19.md): <top-1 retrieved chunk>
     relevant-material (other-file.md): <top-2 retrieved chunk>
   </project-context>
   ```

5. **Critical:** only add this to the *render* call, not the extract call. Extract should stay dump-local to preserve per-teammate author attribution invariants. The renderer is where project context actually changes output quality (the synthesis suddenly knows Dan is a missing voice, that the May launch is non-negotiable, etc.).

**Skip contextualization for POC.** Anthropic's prepend-context trick costs an LLM call per chunk at indexing time. For 1-5 chunks per subproject in a local-first POC, not worth it. Plain embedding retrieval captures >90% of the benefit at this scale. Add the contextualization call later if retrieval quality falls short at real scale.

**Effort:** M (1-2 days). Reuses the transformers.js dep from leverage B.

**Impact:** Very high. This is the slide 11 fix — the headline of the deep-dive deck. Closes the gap between what the README promises and what the pipeline does.

---

### F. Pipeline decomposition (smaller, more focused LLM calls)

**What.** Where the LLM still needs to do work, split that work into smaller pieces with narrower prompts rather than one big "do everything" call.

**Why it works.** Small models are dramatically more reliable on narrow tasks. "Extract ideas" is narrow. "Extract ideas + categorize types + score confidence + produce verbatim quotes that pass a verbatim check" is three things. Prompt adherence decays multiplicatively with the number of constraints.

**How in Teambrain.** Today the extractor does four things in one call:
1. Decide what's an "idea"
2. Classify by type (theme/claim/proposal/concern/question/deliverable)
3. Write a verbatim quote
4. Assign a confidence score

The 2026-04-17 observation "model emits `## Concerns` instead of `## Disputed`" was the renderer doing the same kind of overloaded thing — section structure + author citation + quote selection + filtering "deliverable" types all at once.

**Concrete split:**

- **Extract call** → JSON-schema-constrained (leverage A), output is just `[{ statement, evidence_quote }]`. Drop type and confidence from the LLM call entirely.
- **Classify call** → cheap second pass on each extracted statement: "Given this statement, pick the best type from {theme, claim, proposal, concern, question, deliverable}. Output exactly one word." JSON-schema constrained to an enum. Runs in ~2-3 seconds per idea on 4B. Optional: batch 5-10 ideas per call.
- **Confidence** → derive deterministically from metadata (evidence_quote length relative to statement length; co-occurrence with entity hints from leverage D).
- **Render call** → grammar-constrained markdown output (leverage A) so the three section headers are structurally forbidden from drifting.

**Effort:** S-M (4-8 hours).

**Impact:** Medium. Most of the value here comes *with* leverage A — on its own the effect is smaller. Worth doing as part of the A rollout.

---

## 4. Proposed new pipeline architecture

```
  ┌─────────────┐     ┌─────────────┐     ┌────────────────┐
  │  dumps/*.md │     │ materials/  │     │  problem.md    │
  └──────┬──────┘     └──────┬──────┘     └────────┬───────┘
         │                   │                     │
         │                   └─────────┬───────────┘
         │                             ↓
         │                 ┌───────────────────────┐
         │                 │ embed all chunks      │ ← leverage E
         │                 │ (MiniLM, one-time)    │
         │                 │ write materials-index │
         │                 └───────────────────────┘
         │
         ↓
  ┌──────────────────────────┐
  │ spaCy/compromise.js      │ ← leverage D
  │ extract noun phrases     │
  │ + named entities         │
  └──────────────────────────┘
         │
         ↓
  ┌──────────────────────────┐
  │ LLM extract per dump     │ ← leverage A (grammar-constrained JSON)
  │ with <hints> block       │ ← leverage F (narrow task)
  │ output: {statement,      │
  │          evidence_quote} │
  └──────────┬───────────────┘
             ↓
  ┌──────────────────────────┐
  │ LLM classify type        │ ← leverage F (one call per idea, enum output)
  │ output: enum value only  │ ← leverage A (enum-constrained)
  └──────────┬───────────────┘
             ↓                        ┌───────────────────────┐
  ┌──────────────────────────┐        │ MiniLM embed all      │
  │ cluster ideas            │ ←──────┤ idea statements       │
  │ (agglomerative @ 0.72    │        └───────────────────────┘
  │  cosine similarity)      │        ← leverage B
  └──────────┬───────────────┘
             ↓
  ┌──────────────────────────┐
  │ NLI cross-encoder        │ ← leverage C
  │ on cross-author pairs    │
  │ in different clusters    │
  │ output: contradict edges │
  └──────────┬───────────────┘
             ↓
  ┌──────────────────────────┐
  │ LLM 1 call: "why do      │ ← LLM as composer (small)
  │ A and B contradict?"     │   only on confirmed pairs
  │ 1 call per real pair     │
  └──────────┬───────────────┘
             ↓
  ┌──────────────────────────┐
  │ retrieve top-3 context   │ ← leverage E (at render time)
  │ from materials-index     │
  │ via idea embeddings      │
  └──────────┬───────────────┘
             ↓
  ┌──────────────────────────┐
  │ LLM render final MD      │ ← leverage A (grammar: 3 fixed sections)
  │ input = {clusters,       │ ← leverage F (single narrow task)
  │          contradictions, │
  │          attribution,    │
  │          project-context}│
  │ output = latest.md       │
  └──────────────────────────┘
```

The LLM appears four times (extract, classify, contradiction-reasoning, render), but every one of those calls is narrow, grammar-constrained, or both. The structural decisions (cluster membership, contradiction existence, what materials to surface) are all made by code.

---

## 5. Ranked action plan

Ordered by impact-per-effort. Each item names the acceptance criterion it closes.

| # | Item | Spec acceptance | Effort | Impact |
|---|------|-----------------|--------|--------|
| 1 | Grammar-constrained outputs on all 3 LLM calls (extract / merge / render) | spec-synthesis R005 stub retries, R007 render drift | S | ★★★★★ |
| 2 | Swap LLM merge for embedding + agglomerative clustering | spec-synthesis R006 cluster_id: null bug | M | ★★★★★ |
| 3 | Wire materials + problem.md via retrieval to render call | new R013 — Act 4 finding of deep-dive deck | M | ★★★★☆ |
| 4 | NLI cross-encoder for contradiction edges | spec-synthesis R006 contradictions | M | ★★★★☆ |
| 5 | Noun-phrase `<hints>` block in extract prompt | spec-synthesis R005 recall | S | ★★★☆☆ |
| 6 | Decompose extract into extract + classify calls | spec-synthesis R005 | S | ★★★☆☆ |

**Critical path:** items 1 → 2 → 3 in that order. Item 1 is almost free and kills a whole class of bugs; item 2 unlocks deterministic clustering (which item 4 needs anyway); item 3 is the deep-dive deck's headline fix.

**Parallel-safe:** items 4, 5, 6 can happen in any order after items 1-3 land. They're all additive — no interdependencies.

**Batch as a single Forge spec:** `spec-pipeline-quality.md` with R001-R006 mapping to the six items above. Wire each to an R-number already in `spec-synthesis.md` where the gap is — this is a **backprop-style augment**, not a rewrite of the synthesis spec.

---

## 6. Validation plan — how we know it worked

Three levels.

**Level 1 — deterministic regressions.** Every leverage ships with a unit test using the existing FakeService pattern from `app/src/inference/extractor.test.ts`. Examples:
- Constrained-decoding test: given a schema, the test sends a mocked response with extra scaffolding and asserts only schema-valid output is yielded.
- Clustering test: given 10 fixture statements with 3 known groups, agglomerative clusterer returns 3 clusters.
- NLI test: given 5 fixture pairs with known labels, classifier calls produce the right contradict/entail/neutral verdict.

**Level 2 — re-run the smoke-test fixtures.** The 2026-04-17 Alice/Bob/Carol dumps are already committed. After each leverage lands, re-run synthesis and compare to golden expectations:
- Extraction recall: ≥ 10 ideas total (vs. current 6).
- Cluster count: ≥ 1 cluster of size ≥ 2 (vs. current 0, every `cluster_id: null`).
- Contradiction count: ≥ 2 real contradictions flagged — "defer billing to step 5 risks freemium" vs "billing at step 3 is what broke the funnel" is the canonical pair.
- Render: `## Agreed`, `## Disputed`, `## Move forward` — all three section headers present, exact spelling (vs. current `## Concerns` drift).
- Materials-aware: rendered `## Move forward` cites project context — e.g. references the May launch deadline, the Friday decision, or a material-only fact like "Dan to slice by company size" from the kickoff transcript.

**Level 3 — end-to-end Playwright.** Extend the existing verification run at `app/web/components/SubprojectView/`: click Re-synthesize, assert latest.md contains the three expected section headers, assert Connections graph renders ≥ 1 solid-green edge and ≥ 1 dashed-red edge (currently renders none).

---

## 7. What this plan explicitly does NOT try to fix

- **Upgrade to gemma3:12b.** Out of scope here — needs a bigger GPU than the A1000 6GB. If the six leverages above don't land synthesis quality at a usable place, a 12B upgrade is the next lever — but we should exhaust "make 4B carry less" before "make the model bigger."
- **Real-time SSE reliability.** Already fixed by backprop-1 (Bun.serve idleTimeout) and backprop-4 (Vite proxy). Non-issue.
- **Concurrency / multi-subproject synthesis.** Queue exists at `pipeline.ts:130`. Fine for POC.
- **Exploration persona ("New Direction" chat).** Not implicated in the smoke test findings. No changes here.
- **Cloud API fallback (Claude Sonnet / GPT).** Tempting but explicitly contradicts the local-first positioning in `spec-synthesis.md`. Park it.

---

## 8. Risks

**Risk: transformers.js pulls 400 MB of ONNX models.** Mitigation: lazy-load on first synthesis, cache under `~/.cache/teambrain/models/`, document disk usage. Alternative: offload embeddings + NLI to a Python sidecar — but that contradicts the "one bun run dev" simplicity. Do the JS-native path first.

**Risk: agglomerative clustering at threshold 0.72 is tuned for generic English, may over-cluster for domain-specific language.** Mitigation: expose the threshold in `config.json`. Add a `cluster_threshold_override` knob.

**Risk: Gemma 3's structured-output path has fewer known bugs than Gemma 4, but grammar-constrained generation can still produce token loops on free-text fields.** Mitigation: set a hard `max_tokens` on the evidence_quote field and truncate server-side if exceeded. Flag the dump for manual review.

**Risk: contextual-retrieval step embedding model differs between runs if we change models.** Mitigation: write the model name into `materials-index.json` metadata. Rebuild index if model mismatch detected.

---

## 9. References (cited above)

- [Anthropic — Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — the +49% / +67% failure-rate reductions, exact prompt pattern, $1.02 per million tokens cost figure
- [A Guide to Structured Outputs Using Constrained Decoding — Aidan Cooper](https://www.aidancooper.co.uk/constrained-decoding/) — mechanics of GBNF, pitfalls, model-size independence
- [Ollama Structured Outputs docs](https://docs.ollama.com/capabilities/structured-outputs) — the `format` parameter and JSON Schema → GBNF conversion
- [llama.cpp GBNF README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md) — grammar specification format
- [ollama/ollama#15502](https://github.com/ollama/ollama/issues/15502) — Gemma 4 repetition-collapse bug under grammar constraints (relevant for future migration)
- [BERTopic algorithm](https://maartengr.github.io/BERTopic/algorithm/algorithm.html) — the sentence-transformers → UMAP → HDBSCAN pipeline, timing baselines
- [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) — 5× faster than mpnet, dimensionality 384
- [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — JavaScript ONNX port usable from Bun
- [cross-encoder/nli-deberta-v3-small](https://huggingface.co/cross-encoder/nli-deberta-v3-small) — 100M params, 91.7% SNLI, 87.5% MNLI, outputs [contradiction, entailment, neutral]
- [Microsoft GraphRAG methods](https://microsoft.github.io/graphrag/index/methods/) — standard vs FastGraphRAG, which steps can be deterministic
- [Welcome to GraphRAG](https://microsoft.github.io/graphrag/) — framework overview
- [Sentence Transformers speedup guide](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) — quantization to 12ms/sentence

## 10. Suggested next action

If you want to move on this:

```
/forge brainstorm spec-pipeline-quality.md
```

with this file as the input. I'd recommend scoping the first PR to leverage 1 alone (grammar constraints) because it's S effort, unlocks the behavioral ceiling on everything downstream, and has its own regression tests independent of the embedding work. Then leverages 2 + 3 + 4 as a second PR (embedding runtime + clustering + contradiction + retrieval) since they share the transformers.js dependency.

Everything is reversible — each leverage ships behind a config flag before full removal of the old code path.
