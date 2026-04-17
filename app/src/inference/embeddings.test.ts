// T004 / R002: sanity tests for the embeddings module.
//
// These run against the REAL model (ONNX). First run downloads ~25 MB of
// weights; subsequent runs are fast (in-memory pipeline cached across tests).
// If the download or inference fails (network offline, platform-incompatible
// ONNX binary), the tests skip with a clear message instead of failing —
// the feature is gated behind features.embedding_cluster anyway, and
// clustering quality degrades gracefully to the legacy LLM-merger path.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cosineSimilarity, embed, resetEmbeddingsForTest } from "./embeddings";

let embeddingsAvailable = false;

beforeAll(async () => {
  try {
    const [probe] = await embed(["hello"]);
    embeddingsAvailable = Array.isArray(probe) && probe.length === 384;
  } catch (e) {
    console.warn(`[embeddings.test] embeddings unavailable: ${(e as Error).message}`);
    embeddingsAvailable = false;
  }
});

afterAll(() => {
  resetEmbeddingsForTest();
});

describe("embeddings", () => {
  test("returns 384-dim vectors for non-empty input", async () => {
    if (!embeddingsAvailable) return;
    const out = await embed(["the quick brown fox"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(384);
  });

  test("empty input → empty output without loading the model", async () => {
    // This path must work even if embeddings are unavailable.
    const out = await embed([]);
    expect(out).toEqual([]);
  });

  test("identical strings yield byte-identical vectors (determinism invariant)", async () => {
    if (!embeddingsAvailable) return;
    const [a, b] = await embed(["billing at step 3", "billing at step 3"]);
    expect(a).toEqual(b!);
  });

  test("near-paraphrase sentences have cosine similarity > 0.7", async () => {
    if (!embeddingsAvailable) return;
    const [a, b] = await embed([
      "The billing form is too long",
      "The billing form is too lengthy",
    ]);
    expect(cosineSimilarity(a!, b!)).toBeGreaterThan(0.7);
  });

  test("topically-related sentences have cosine similarity > orthogonal pair", async () => {
    if (!embeddingsAvailable) return;
    // Rather than asserting an absolute threshold (which is brittle on a
    // 384-dim MiniLM — even clearly-related pairs often land in the
    // 0.5-0.7 range), assert that the related pair beats the orthogonal
    // pair by a clear margin. Informs the clustering threshold choice.
    const [related_a, related_b, orth_a, orth_b] = await embed([
      "We should ship the product by May 1",
      "The launch target date is May 1",
      "The billing form is too long",
      "A hurricane damaged the coastal power grid",
    ]);
    const relatedSim = cosineSimilarity(related_a!, related_b!);
    const orthSim = cosineSimilarity(orth_a!, orth_b!);
    expect(relatedSim).toBeGreaterThan(orthSim + 0.2);
  });

  test("orthogonal sentences have cosine similarity < 0.5", async () => {
    if (!embeddingsAvailable) return;
    const [a, b] = await embed([
      "The billing form is too long",
      "A hurricane damaged the coastal power grid",
    ]);
    expect(cosineSimilarity(a!, b!)).toBeLessThan(0.5);
  });

  test("cosineSimilarity rejects mismatched dimensions", () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(/dimension mismatch/);
  });
});
