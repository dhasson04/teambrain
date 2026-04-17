import chokidar, { type FSWatcher } from "chokidar";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFrontmatter } from "../vault/fs-utils";
import {
  ExplorationFrontmatterSchema,
  type PromptFrontmatter,
  PromptFrontmatterSchema,
  SynthesisFrontmatterSchema,
} from "./prompt-schema";

export interface ResolvedPrompt {
  id: string;
  frontmatter: PromptFrontmatter;
  body: string;
  /** Body with all _shared includes concatenated above the prompt-specific body */
  composed: string;
  source_path: string;
  loaded_at: string;
}

export interface RegistryOptions {
  promptsDir: string;
  watch?: boolean;
  /** Override the default per-id schema. Useful for tests. */
  schemaFor?: (id: string) => typeof PromptFrontmatterSchema;
}

const DEFAULT_SCHEMA_FOR = (id: string): typeof PromptFrontmatterSchema => {
  if (id === "synthesis") return SynthesisFrontmatterSchema as unknown as typeof PromptFrontmatterSchema;
  if (id === "exploration") return ExplorationFrontmatterSchema as unknown as typeof PromptFrontmatterSchema;
  return PromptFrontmatterSchema;
};

export class PromptRegistry {
  private readonly cache = new Map<string, ResolvedPrompt>();
  private watcher: FSWatcher | null = null;
  private readonly schemaFor: (id: string) => typeof PromptFrontmatterSchema;

  constructor(private readonly options: RegistryOptions) {
    this.schemaFor = options.schemaFor ?? DEFAULT_SCHEMA_FOR;
  }

  async load(): Promise<void> {
    const dir = this.options.promptsDir;
    if (!existsSync(dir)) {
      throw new Error(`prompts directory not found: ${dir}`);
    }
    for (const id of ["synthesis", "exploration"]) {
      try {
        const prompt = await this.loadOne(id);
        this.cache.set(id, prompt);
      } catch (e) {
        // On invalid frontmatter, keep last-good cached version (or skip if none)
        console.error(`[prompt-registry] failed to load ${id}:`, (e as Error).message);
      }
    }

    if (this.options.watch) {
      this.watcher = chokidar.watch(`${dir}/**/*.md`, { ignoreInitial: true });
      this.watcher.on("all", () => {
        void this.reload();
      });
    }
  }

  private async loadOne(id: string): Promise<ResolvedPrompt> {
    const path = resolve(this.options.promptsDir, `${id}.md`);
    if (!existsSync(path)) throw new Error(`prompt file missing: ${path}`);
    const raw = await readFile(path, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const fm = this.schemaFor(id).parse(data) as PromptFrontmatter;
    const includesText = await this.resolveIncludes(fm.includes);
    const composed = `${includesText}${body}`.trim();
    return {
      id: fm.id,
      frontmatter: fm,
      body: body.trim(),
      composed,
      source_path: path,
      loaded_at: new Date().toISOString(),
    };
  }

  private async resolveIncludes(paths: string[]): Promise<string> {
    if (!paths || paths.length === 0) return "";
    const parts: string[] = [];
    for (const rel of paths) {
      const path = resolve(this.options.promptsDir, rel);
      if (!existsSync(path)) {
        throw new Error(`include not found: ${rel}`);
      }
      const raw = await readFile(path, "utf8");
      const { body } = parseFrontmatter(raw);
      parts.push(body.trim());
    }
    return `${parts.join("\n\n")}\n\n`;
  }

  async reload(): Promise<void> {
    for (const id of this.cache.keys()) {
      try {
        const prompt = await this.loadOne(id);
        this.cache.set(id, prompt);
      } catch (e) {
        console.error(`[prompt-registry] reload failed for ${id}, keeping last-good:`, (e as Error).message);
      }
    }
  }

  get(id: string): ResolvedPrompt {
    const p = this.cache.get(id);
    if (!p) throw new Error(`unknown prompt id: ${id}`);
    return p;
  }

  list(): string[] {
    return [...this.cache.keys()];
  }

  async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
