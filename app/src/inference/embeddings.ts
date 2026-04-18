// R002: sentence embeddings for clustering + retrieval.
//
// Uses @huggingface/transformers (formerly Xenova/transformers.js) to run
// `Xenova/all-MiniLM-L6-v2` via ONNX locally. Model weights are lazy-
// loaded + cached under the HF default (~/.cache/huggingface/ on *nix,
// %USERPROFILE%\.cache\huggingface on Windows). One-time download is
// ~25 MB; subsequent calls reuse the in-memory pipeline.
//
// Why this model:
//   - 22M params, 384-dim output, English, 5x faster than mpnet-base
//   - Directly supported by Xenova's ONNX port (no custom conversion)
//   - Standard baseline for short-sentence similarity work (BERTopic, etc.)
//
// Determinism: ONNX runtime in inference-only mode with a fixed model
// produces byte-identical outputs for identical inputs within a machine;
// we depend on this for the clustering path's reproducibility invariant
// in spec-pipeline-quality.md §"Hard rules" point 3.

// Dynamic import so this module can be loaded in environments without the
// dep installed (CI type-checking, for instance). The feature is always
// gated behind features.embedding_cluster in config anyway.
type PipelineFn = (
  texts: string | string[],
  options?: { pooling?: "mean" | "cls"; normalize?: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractor: PipelineFn | null = null;
let loading: Promise<void> | null = null;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function ensureExtractor(): Promise<void> {
  if (extractor) return;
  if (loading) return loading;
  loading = (async () => {
    // Dynamic import keeps startup cost out of the main path.
    const { pipeline } = await import("@huggingface/transformers");
    extractor = (await pipeline("feature-extraction", MODEL_ID)) as unknown as PipelineFn;
  })();
  await loading;
  loading = null;
}

/**
 * Embed a batch of texts. Returns one row per input text; each row is a
 * length-384 float array (mean-pooled, L2-normalized — suitable for
 * cosine similarity).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  await ensureExtractor();
  if (!extractor) throw new Error("embeddings pipeline failed to initialize");
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

/**
 * Cosine similarity of two equally-sized normalized embedding vectors.
 * Since `embed()` already L2-normalizes, this is just a dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Release the cached pipeline (useful between tests). */
export function resetEmbeddingsForTest(): void {
  extractor = null;
  loading = null;
}

export const EMBEDDING_MODEL_ID = MODEL_ID;
