// R002 part 2: deterministic cross-dump clustering.
//
// Single-linkage agglomerative clustering over cosine similarity.
// Small-N friendly (< 100 ideas). Replaces the LLM merger for the
// "group similar ideas" job, which the 2026-04-17 smoke test showed
// gemma3:4b can't do reliably (cluster_id: null on every idea).

import type { AttributedIdea } from "./extractor";

export interface ClusterAssignment {
  idea_id: string;
  cluster_id: string | null;
}

export interface Cluster {
  cluster_id: string;
  member_idea_ids: string[];
  authors: Set<string>;
}

export interface ClusterResult {
  assignments: ClusterAssignment[];
  clusters: Cluster[];
}

export interface ClusterInput {
  idea_id: string;
  author: string;
  embedding: number[];
}

function cosine(a: number[], b: number[]): number {
  // Assumes inputs are L2-normalized (as `embed()` produces).
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Single-linkage agglomerative clustering.
 *
 * Algorithm:
 *   1. Compute NxN cosine similarity matrix (upper triangle only).
 *   2. For each pair with similarity >= threshold, union-find their clusters.
 *   3. Clusters of size 1 remain null-cluster-id (lone ideas; no agreement signal).
 *
 * Deterministic: output cluster ids are assigned by sorted idea_id of the
 * smallest member, so repeat runs on the same input produce identical
 * assignments.
 *
 * O(N^2) in the number of ideas. Fine up to ~200 ideas. For larger,
 * switch to HDBSCAN via a JS binding or a sidecar.
 */
export function cluster(ideas: ClusterInput[], threshold = 0.55): ClusterResult {
  if (ideas.length === 0) {
    return { assignments: [], clusters: [] };
  }
  if (ideas.length === 1) {
    return {
      assignments: [{ idea_id: ideas[0]!.idea_id, cluster_id: null }],
      clusters: [],
    };
  }

  // Union-find over idea indices.
  const parent = ideas.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Compare every pair once; union when similarity >= threshold.
  for (let i = 0; i < ideas.length; i++) {
    for (let j = i + 1; j < ideas.length; j++) {
      const sim = cosine(ideas[i]!.embedding, ideas[j]!.embedding);
      if (sim >= threshold) union(i, j);
    }
  }

  // Group by root. Skip singleton groups — they don't get a cluster id.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < ideas.length; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  const clusters: Cluster[] = [];
  const assignments: ClusterAssignment[] = ideas.map((i) => ({
    idea_id: i.idea_id,
    cluster_id: null,
  }));

  // Deterministic cluster id: use the smallest idea_id in the group as
  // the suffix so re-running produces the same ids.
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const members = indices.map((idx) => ideas[idx]!).sort((a, b) =>
      a.idea_id < b.idea_id ? -1 : a.idea_id > b.idea_id ? 1 : 0,
    );
    const cluster_id = `c-${members[0]!.idea_id}`;
    const authors = new Set(members.map((m) => m.author));
    clusters.push({
      cluster_id,
      member_idea_ids: members.map((m) => m.idea_id),
      authors,
    });
    for (const idx of indices) {
      const slot = assignments.find((a) => a.idea_id === ideas[idx]!.idea_id)!;
      slot.cluster_id = cluster_id;
    }
  }

  return { assignments, clusters };
}

/**
 * Convenience: given attributed ideas (with statements) and an embed()
 * function, run the full embed → cluster pipeline.
 */
export async function clusterIdeas(
  ideas: Array<AttributedIdea & { idea_id: string }>,
  embed: (texts: string[]) => Promise<number[][]>,
  threshold = 0.55,
): Promise<ClusterResult> {
  if (ideas.length === 0) return { assignments: [], clusters: [] };
  const statements = ideas.map((i) => i.statement);
  const embeddings = await embed(statements);
  const input: ClusterInput[] = ideas.map((i, idx) => ({
    idea_id: i.idea_id,
    author: i.author,
    embedding: embeddings[idx]!,
  }));
  return cluster(input, threshold);
}
