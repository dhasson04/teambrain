import { describe, expect, test } from "bun:test";
import { cluster, type ClusterInput } from "./clustering";

// Simple fixture vectors — 3-dim for easy reasoning. Real embeddings are
// 384-dim but the algorithm is dimension-agnostic.
function vec(...x: number[]): number[] {
  const norm = Math.hypot(...x);
  return x.map((v) => v / (norm || 1));
}

describe("cluster", () => {
  test("returns empty for empty input", () => {
    const r = cluster([]);
    expect(r.assignments).toEqual([]);
    expect(r.clusters).toEqual([]);
  });

  test("returns single null-cluster for one idea", () => {
    const r = cluster([{ idea_id: "i1", author: "a", embedding: vec(1, 0, 0) }]);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0]?.cluster_id).toBeNull();
    expect(r.clusters).toHaveLength(0);
  });

  test("clusters two near-identical vectors above threshold", () => {
    const input: ClusterInput[] = [
      { idea_id: "i1", author: "alice", embedding: vec(1, 0.05, 0) },
      { idea_id: "i2", author: "bob", embedding: vec(1, 0.04, 0.01) },
    ];
    const r = cluster(input, 0.9);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]?.member_idea_ids).toEqual(["i1", "i2"]);
    expect(r.clusters[0]?.authors.has("alice")).toBe(true);
    expect(r.clusters[0]?.authors.has("bob")).toBe(true);
    expect(r.assignments[0]?.cluster_id).toBe(r.clusters[0]?.cluster_id ?? "");
  });

  test("does not cluster orthogonal vectors", () => {
    const input: ClusterInput[] = [
      { idea_id: "i1", author: "a", embedding: vec(1, 0, 0) },
      { idea_id: "i2", author: "b", embedding: vec(0, 1, 0) },
    ];
    const r = cluster(input, 0.55);
    expect(r.clusters).toHaveLength(0);
    expect(r.assignments.every((a) => a.cluster_id === null)).toBe(true);
  });

  test("three-member cluster via transitive similarity (single-linkage)", () => {
    // A ~ B, B ~ C, but A not directly ~ C; single-linkage still unions all three.
    const input: ClusterInput[] = [
      { idea_id: "a", author: "x", embedding: vec(1.0, 0.5, 0.0) },
      { idea_id: "b", author: "y", embedding: vec(0.5, 1.0, 0.5) },
      { idea_id: "c", author: "z", embedding: vec(0.0, 0.5, 1.0) },
    ];
    const r = cluster(input, 0.7);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]?.member_idea_ids.sort()).toEqual(["a", "b", "c"]);
    expect(r.clusters[0]?.authors.size).toBe(3);
  });

  test("threshold override tightens clustering", () => {
    const input: ClusterInput[] = [
      { idea_id: "i1", author: "a", embedding: vec(1, 0.5, 0) },
      { idea_id: "i2", author: "b", embedding: vec(1, 0.3, 0) },
    ];
    const loose = cluster(input, 0.5);
    const strict = cluster(input, 0.999);
    expect(loose.clusters.length).toBeGreaterThan(strict.clusters.length);
  });

  test("cluster_id is deterministic across runs (sorted-by-member invariant)", () => {
    const input: ClusterInput[] = [
      { idea_id: "z-last", author: "a", embedding: vec(1, 0, 0) },
      { idea_id: "a-first", author: "b", embedding: vec(1, 0, 0) },
    ];
    const r1 = cluster(input, 0.5);
    const r2 = cluster(input, 0.5);
    expect(r1.clusters[0]?.cluster_id).toBe(r2.clusters[0]?.cluster_id ?? "");
    // id suffix is the sorted-first idea_id, so it's the 'a-first' one.
    expect(r1.clusters[0]?.cluster_id).toBe("c-a-first");
  });

  test("two independent clusters in the same batch", () => {
    const input: ClusterInput[] = [
      { idea_id: "i1", author: "a", embedding: vec(1, 0, 0) },
      { idea_id: "i2", author: "b", embedding: vec(1, 0.02, 0) },
      { idea_id: "i3", author: "c", embedding: vec(0, 1, 0) },
      { idea_id: "i4", author: "d", embedding: vec(0, 1, 0.02) },
    ];
    const r = cluster(input, 0.95);
    expect(r.clusters).toHaveLength(2);
    // Each cluster has 2 distinct authors.
    expect([...(r.clusters[0]?.authors ?? [])].length).toBe(2);
    expect([...(r.clusters[1]?.authors ?? [])].length).toBe(2);
  });
});
