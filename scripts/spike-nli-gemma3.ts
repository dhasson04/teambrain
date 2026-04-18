// Spike: can gemma3:4b do binary-ish NLI via Ollama's enum-constrained JSON?
// Goal: decide whether to plan nli-reboot spec around Ollama+JSON (option B
// from forge:brainstorm 2026-04-18) or pivot to path A' (manual
// transformers.js tokenize + forward). Target: Fixture B's May-1/
// push-past-May contradict pair.
//
// T003 (spec-nli-reboot.md R004): pair data moved to
// app/src/inference/__fixtures__/nli-pairs.json so the spike and the
// integration test stay in sync.

import fixturePairs from "../app/src/inference/__fixtures__/nli-pairs.json" with { type: "json" };

const OLLAMA = "http://127.0.0.1:11434/api/chat";
const MODEL = "gemma3:4b";

type Expected = "contradict" | "entail" | "neutral";

interface Pair {
  id: string;
  premise: string;
  hypothesis: string;
  expected: Expected;
}

const PAIRS: Pair[] = fixturePairs as Pair[];

const SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: ["contradict", "entail", "neutral"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", minLength: 1, maxLength: 200 },
  },
  required: ["label", "confidence", "reason"],
  additionalProperties: false,
};

const SYSTEM = `You are a strict Natural Language Inference classifier. Given a PREMISE and a HYPOTHESIS, decide whether the HYPOTHESIS:
- contradict: directly disagrees with or negates the PREMISE
- entail: re-states, paraphrases, or logically follows from the PREMISE
- neutral: talks about a different topic, or the relationship is unclear

Return JSON only. No prose outside the JSON.`;

interface OllamaResp {
  message?: { content?: string };
  total_duration?: number;
}

async function classifyOnce(
  premise: string,
  hypothesis: string,
): Promise<{ label: string; confidence: number; reason: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: SCHEMA,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `PREMISE:\n${premise}\n\nHYPOTHESIS:\n${hypothesis}\n\nClassify the relationship.`,
        },
      ],
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as OllamaResp;
  const raw = body.message?.content ?? "";
  const parsed = JSON.parse(raw);
  return { ...parsed, ms };
}

async function main(): Promise<void> {
  const RUNS = 3;
  console.log(`spike-nli-gemma3: model=${MODEL} runs=${RUNS} pairs=${PAIRS.length}\n`);

  let totalMs = 0;
  let totalCalls = 0;
  let correctCount = 0;

  for (const pair of PAIRS) {
    console.log(`=== ${pair.id} (expected=${pair.expected}) ===`);
    console.log(`  P: ${pair.premise}`);
    console.log(`  H: ${pair.hypothesis}`);
    const labels: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await classifyOnce(pair.premise, pair.hypothesis);
        labels.push(r.label);
        totalMs += r.ms;
        totalCalls += 1;
        if (r.label === pair.expected) correctCount += 1;
        console.log(`  run ${i + 1}: label=${r.label} conf=${r.confidence.toFixed(2)} ms=${r.ms} reason="${r.reason.slice(0, 80)}"`);
      } catch (e) {
        console.log(`  run ${i + 1}: ERROR ${(e as Error).message}`);
      }
    }
    const agree = labels.every((l) => l === labels[0]);
    console.log(`  stability: ${agree ? "stable" : "FLIP"} across ${RUNS} runs (${labels.join(",")})\n`);
  }

  console.log(`\n--- summary ---`);
  console.log(`calls: ${totalCalls}`);
  console.log(`correct: ${correctCount}/${totalCalls} = ${((correctCount / totalCalls) * 100).toFixed(0)}%`);
  console.log(`avg latency: ${Math.round(totalMs / totalCalls)}ms`);
  console.log(`total time: ${(totalMs / 1000).toFixed(1)}s`);
}

void main();
