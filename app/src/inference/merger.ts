import { z } from "zod";
import { loadConfig } from "../server/config";
import {
  type AttributionEntry,
  type AttributionFile,
  type Connection,
  ConnectionKindSchema,
  type ConnectionsFile,
  type Idea,
  type IdeasFile,
  writeIdeasBundle,
} from "../vault/ideas";
import { clusterIdeas } from "./clustering";
import { embed } from "./embeddings";
import type { AttributedIdea } from "./extractor";
import type { InferenceService } from "./inference-service";

export const MergeResponseSchema = z.object({
  clusters: z
    .array(
      z.object({
        cluster_id: z.string().min(1),
        member_idea_ids: z.array(z.string()).min(1),
      }),
    )
    .default([]),
  contradictions: z
    .array(
      z.object({
        left_idea_id: z.string().min(1),
        right_idea_id: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        kind: ConnectionKindSchema,
        weight: z.number().min(0).max(1),
      }),
    )
    .default([]),
});
export type MergeResponse = z.infer<typeof MergeResponseSchema>;

const MERGE_INSTRUCTIONS = `
You will receive a list of ideas extracted from team brain dumps. Each
idea has an id, statement, type, contributing dump_id and author.

Return strict JSON of shape:
{
  "clusters": [{ "cluster_id": "c1", "member_idea_ids": ["<idea_id>", ...] }],
  "contradictions": [{ "left_idea_id": "<idea_id>", "right_idea_id": "<idea_id>", "reason": "explicit opposition on subject X" }],
  "edges": [{ "from": "<idea_id>", "to": "<idea_id>", "kind": "agree|contradict|related", "weight": 0.0-1.0 }]
}

Rules:
- Group ideas with the same or near-identical statement into a single cluster. Cluster size 1 is valid (lone idea).
- Flag a contradiction ONLY when two ideas explicitly oppose each other on the same subject. Different topics are not contradictions.
- Edge "kind":
  - "agree" when both ideas reinforce the same point (often within a cluster)
  - "contradict" when they oppose
  - "related" when they touch the same theme but neither agree nor contradict
- weight is your confidence in the connection.

Refer to ideas only by the idea_id values supplied. Do not invent new ids.
`;

// R001: JSON Schema mirroring MergeResponseSchema. Passed as Ollama's
// `format` field so the sampler cannot emit shape violations.
const MERGE_FORMAT = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cluster_id: { type: "string", minLength: 1 },
          member_idea_ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
        },
        required: ["cluster_id", "member_idea_ids"],
        additionalProperties: false,
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          left_idea_id: { type: "string", minLength: 1 },
          right_idea_id: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
        },
        required: ["left_idea_id", "right_idea_id", "reason"],
        additionalProperties: false,
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string", minLength: 1 },
          to: { type: "string", minLength: 1 },
          kind: { type: "string", enum: ["agree", "contradict", "related"] },
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["from", "to", "kind", "weight"],
        additionalProperties: false,
      },
    },
  },
  required: ["clusters", "contradictions", "edges"],
  additionalProperties: false,
} as const;

export interface AssignedIdea extends AttributedIdea {
  idea_id: string;
}

export function assignIdeaIds(ideas: AttributedIdea[]): AssignedIdea[] {
  const counters = new Map<string, number>();
  return ideas.map((i) => {
    const n = counters.get(i.dump_id) ?? 0;
    counters.set(i.dump_id, n + 1);
    return { ...i, idea_id: `${i.dump_id}-i${n}` };
  });
}

export interface MergeInput {
  service: InferenceService;
  project: string;
  sub: string;
  attributed: AttributedIdea[];
  /** Override the model used for the merger pass. */
  modelOverride?: string;
}

export interface MergeOutput {
  ideas: IdeasFile;
  connections: ConnectionsFile;
  attribution: AttributionFile;
  raw: MergeResponse;
}

function compactIdeasForPrompt(ideas: AssignedIdea[]): string {
  return ideas
    .map((i) => `- ${i.idea_id} | ${i.type} | ${JSON.stringify(i.statement)} | author=${i.author} dump=${i.dump_id}`)
    .join("\n");
}

/**
 * R002 replacement path: deterministic embedding clustering.
 *
 * When features.embedding_cluster is enabled (default), we skip the LLM
 * merge call entirely. Ideas are embedded via MiniLM; clusters come from
 * single-linkage agglomerative over cosine similarity at
 * config.cluster_threshold. Contradictions are NOT produced here — they
 * move to a dedicated NLI pass in R003 (nli.ts).
 *
 * Output matches MergeResponse so the downstream pipeline is unchanged.
 */
async function mergeViaEmbedding(
  assigned: AssignedIdea[],
  threshold: number,
): Promise<MergeResponse> {
  const result = await clusterIdeas(assigned, embed, threshold);
  const clusters = result.clusters.map((c) => ({
    cluster_id: c.cluster_id,
    member_idea_ids: c.member_idea_ids,
  }));
  // Build agree edges between all pairs within a cluster.
  const edges: Array<{ from: string; to: string; kind: "agree" | "contradict" | "related"; weight: number }> = [];
  for (const c of result.clusters) {
    for (let i = 0; i < c.member_idea_ids.length; i++) {
      for (let j = i + 1; j < c.member_idea_ids.length; j++) {
        edges.push({
          from: c.member_idea_ids[i]!,
          to: c.member_idea_ids[j]!,
          kind: "agree",
          weight: 0.8,
        });
      }
    }
  }
  return {
    clusters,
    contradictions: [], // NLI pass in R003 fills this in a separate step.
    edges,
  };
}

export async function mergeIdeas(input: MergeInput): Promise<MergeOutput> {
  const assigned = assignIdeaIds(input.attributed);
  const cfg = loadConfig();

  let parsed: MergeResponse;
  if (cfg.features?.embedding_cluster !== false) {
    // R002: deterministic path.
    parsed = await mergeViaEmbedding(assigned, cfg.cluster_threshold ?? 0.55);
  } else {
    // Legacy LLM merge — kept in-tree for rollback / comparison.
    const userMsg = `${MERGE_INSTRUCTIONS}\n\n<ideas>\n${compactIdeasForPrompt(assigned)}\n</ideas>`;
    const raw = await input.service.runToString({
      persona_id: "synthesis",
      format: MERGE_FORMAT,
      messages: [{ role: "user", content: userMsg }],
    });
    parsed = MergeResponseSchema.parse(JSON.parse(raw));
  }

  const idById = new Map(assigned.map((i) => [i.idea_id, i]));
  const validIds = new Set(idById.keys());

  // Apply cluster assignments to ideas
  const clusterById = new Map<string, string>();
  for (const c of parsed.clusters) {
    for (const memberId of c.member_idea_ids) {
      if (validIds.has(memberId)) clusterById.set(memberId, c.cluster_id);
    }
  }

  const now = new Date().toISOString();
  const ideasOut: Idea[] = assigned.map((i) => ({
    idea_id: i.idea_id,
    statement: i.statement,
    type: i.type,
    cluster_id: clusterById.get(i.idea_id) ?? null,
    contributing_dumps: [i.dump_id],
    created: now,
  }));

  // Drop edges whose endpoints don't exist; assign edge_ids
  const edgesValid = parsed.edges.filter((e) => validIds.has(e.from) && validIds.has(e.to));
  const connectionsOut: Connection[] = edgesValid.map((e, idx) => ({
    edge_id: `e${idx + 1}`,
    from_idea: e.from,
    to_idea: e.to,
    kind: e.kind,
    weight: e.weight,
  }));

  // Add explicit contradiction edges from the contradictions array if not already present
  for (const c of parsed.contradictions) {
    if (!validIds.has(c.left_idea_id) || !validIds.has(c.right_idea_id)) continue;
    if (c.left_idea_id === c.right_idea_id) continue;
    const exists = connectionsOut.some(
      (e) =>
        e.kind === "contradict" &&
        ((e.from_idea === c.left_idea_id && e.to_idea === c.right_idea_id) ||
          (e.from_idea === c.right_idea_id && e.to_idea === c.left_idea_id)),
    );
    if (exists) continue;
    connectionsOut.push({
      edge_id: `c${connectionsOut.length + 1}`,
      from_idea: c.left_idea_id,
      to_idea: c.right_idea_id,
      kind: "contradict",
      weight: 0.9,
    });
  }

  // Attribution: every idea must have at least one entry
  const attributionOut: AttributionFile = {};
  for (const i of assigned) {
    const entry: AttributionEntry = {
      dump_id: i.dump_id,
      author: i.author,
      verbatim_quote: i.evidence_quote,
    };
    attributionOut[i.idea_id] = [entry];
  }

  await writeIdeasBundle(input.project, input.sub, {
    ideas: { ideas: ideasOut },
    connections: { connections: connectionsOut },
    attribution: attributionOut,
  });

  return {
    ideas: { ideas: ideasOut },
    connections: { connections: connectionsOut },
    attribution: attributionOut,
    raw: parsed,
  };
}
