import { motion } from "motion/react";
import type { SlideProps } from "../StepIndicator";

// Verbatim from app/src/inference/extractor.ts line 37-56
const EXTRACTION_INSTRUCTIONS = `Extract ideas from the brain dump below. Return strict JSON of shape:
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

Drop any idea you cannot ground in a verbatim quote.`;

// Real JSONL entry from app/vault/.synthesis-log.jsonl (the big render after T003 fuzzy fix)
const REAL_LOG_ENTRY = `{"ts":"2026-04-17T13:51:10.209Z","persona_id":"synthesis","model":"gemma3:4b","prompt_tokens":1539,"completion_tokens":1479,"duration_ms":44274}`;

export function ExtractStage({ isActive }: SlideProps) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center px-8 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Act 2 · Stage 1 of 4 — Extract
      </p>
      <h2 className="mb-2 text-center text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
        Per-dump JSON extraction
      </h2>
      <p className="mb-8 max-w-3xl text-center text-sm text-[var(--text-secondary)]">
        For each changed dump, the synthesis persona is called in JSON mode with this
        instruction block prepended to the dump body.
      </p>

      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-[1.4fr_1fr]">
        <motion.div
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          initial={{ x: -16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: -16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
              EXTRACTION_INSTRUCTIONS
            </p>
            <code className="font-mono text-[10px] text-[var(--text-muted)]">
              app/src/inference/extractor.ts:37-56
            </code>
          </div>
          <pre className="max-h-[24rem] overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {EXTRACTION_INSTRUCTIONS}
          </pre>
        </motion.div>

        <motion.div
          className="flex flex-col gap-4"
          initial={{ x: 16, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 16, opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--info)]">
              Inference params (prompts/synthesis.md frontmatter)
            </p>
            <div className="space-y-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
              <div>model: <span className="text-[var(--text-primary)]">gemma3:4b</span></div>
              <div>temperature: <span className="text-[var(--text-primary)]">0.4</span></div>
              <div>top_p: <span className="text-[var(--text-primary)]">0.8</span></div>
              <div>top_k: <span className="text-[var(--text-primary)]">40</span></div>
              <div>json_mode: <span className="text-[var(--agreement)]">true</span></div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--warning)]">
              Real call · vault/.synthesis-log.jsonl
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-relaxed text-[var(--text-secondary)]">
              {REAL_LOG_ENTRY}
            </pre>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
              <span>44 seconds, 1479 output tokens, on RTX A1000 6GB</span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-light)] bg-[var(--surface-elevated)] p-4">
            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
              Cache key: BLAKE3 hash of the dump body. Unchanged dumps yield{" "}
              <code className="font-mono text-[var(--agreement)]">cached</code> and skip the
              LLM entirely. That's the only reason re-running synthesis isn't bankrupting.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
