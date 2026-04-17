import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWriteFile, ensureDir, resolveVaultPath } from "../vault/fs-utils";
import { readIdeas } from "../vault/ideas";
import type { ChatMessage } from "./inference-service";

export interface ExplorationTabHistory {
  tab_id: string;
  subproject_id: string | null;
  messages: ChatMessage[];
  created: string;
  updated: string;
}

function tabPath(tabId: string): string {
  return resolveVaultPath(".exploration", `${tabId}.json`);
}

const TAB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class InvalidTabId extends Error {
  constructor(public readonly tabId: string) {
    super(`invalid tab_id: ${tabId}`);
    this.name = "InvalidTabId";
  }
}

export function assertValidTabId(tabId: string): void {
  if (!TAB_ID_RE.test(tabId)) throw new InvalidTabId(tabId);
}

export async function loadTabHistory(tabId: string): Promise<ExplorationTabHistory | null> {
  assertValidTabId(tabId);
  const path = tabPath(tabId);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ExplorationTabHistory;
}

export async function saveTabHistory(history: ExplorationTabHistory): Promise<void> {
  assertValidTabId(history.tab_id);
  await ensureDir(resolveVaultPath(".exploration"));
  const next: ExplorationTabHistory = { ...history, updated: new Date().toISOString() };
  await atomicWriteFile(tabPath(history.tab_id), `${JSON.stringify(next, null, 2)}\n`);
}

export async function appendTabMessage(
  tabId: string,
  subprojectId: string | null,
  message: ChatMessage,
): Promise<ExplorationTabHistory> {
  const existing = await loadTabHistory(tabId);
  const now = new Date().toISOString();
  const history: ExplorationTabHistory =
    existing ?? { tab_id: tabId, subproject_id: subprojectId, messages: [], created: now, updated: now };
  history.messages.push(message);
  await saveTabHistory(history);
  return history;
}

export interface RetrievedIdea {
  idea_id: string;
  statement: string;
  type: string;
  contributing_dumps: string[];
}

/**
 * POC-grade retrieval: tokenize the query into lowercase terms, score each idea by
 * how many terms appear as substrings in its statement, return top 5 by score.
 * No embeddings, no rerank — fast and good enough for a single-project context.
 */
export async function retrieveFromGraph(
  project: string,
  sub: string,
  query: string,
  topK = 5,
): Promise<RetrievedIdea[]> {
  const ideasFile = await readIdeas(project, sub);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 3);
  if (terms.length === 0) {
    return ideasFile.ideas.slice(0, topK).map((i) => ({
      idea_id: i.idea_id,
      statement: i.statement,
      type: i.type,
      contributing_dumps: i.contributing_dumps,
    }));
  }
  const scored = ideasFile.ideas.map((idea) => {
    const haystack = idea.statement.toLowerCase();
    const score = terms.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
    return { idea, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({
      idea_id: s.idea.idea_id,
      statement: s.idea.statement,
      type: s.idea.type,
      contributing_dumps: s.idea.contributing_dumps,
    }));
}

/**
 * When a subproject is attached, prepend a context block listing the top
 * relevant ideas so the exploration model can reference them grounded.
 * Far simpler than wiring up tool-calling against Gemma which doesn't
 * uniformly support function-calling in early-2026 Ollama.
 */
export function buildContextBlock(retrieved: RetrievedIdea[]): string {
  if (retrieved.length === 0) return "";
  const lines = retrieved.map(
    (r) => `- ${r.idea_id} (${r.type}): "${r.statement}" [from ${r.contributing_dumps.join(", ")}]`,
  );
  return `<context source="knowledge_graph">\n${lines.join("\n")}\n</context>\n\n`;
}
