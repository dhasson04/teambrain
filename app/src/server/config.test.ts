import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resetConfigCache } from "./config";

let tmpRoot: string;
let originalEnv: Record<string, string | undefined>;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "teambrain-config-"));
  originalEnv = {
    TEAMBRAIN_CONFIG: process.env["TEAMBRAIN_CONFIG"],
    TEAMBRAIN_MODEL: process.env["TEAMBRAIN_MODEL"],
    OLLAMA_URL: process.env["OLLAMA_URL"],
    TEAMBRAIN_VAULT: process.env["TEAMBRAIN_VAULT"],
  };
  delete process.env["TEAMBRAIN_CONFIG"];
  delete process.env["TEAMBRAIN_MODEL"];
  delete process.env["OLLAMA_URL"];
  delete process.env["TEAMBRAIN_VAULT"];
  resetConfigCache();
});

afterEach(async () => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("returns built-in defaults when no file or env is present", () => {
    process.env["TEAMBRAIN_CONFIG"] = join(tmpRoot, "missing.json");
    resetConfigCache();
    const cfg = loadConfig();
    expect(cfg.model_default).toBe("gemma3:4b");
    expect(cfg.ollama_url).toBe("http://127.0.0.1:11434");
  });

  test("reads model_default + ollama_url from config.json", async () => {
    const path = join(tmpRoot, "config.json");
    await writeFile(
      path,
      JSON.stringify({ model_default: "gemma3:12b", ollama_url: "http://localhost:9999" }),
    );
    process.env["TEAMBRAIN_CONFIG"] = path;
    resetConfigCache();
    const cfg = loadConfig();
    expect(cfg.model_default).toBe("gemma3:12b");
    expect(cfg.ollama_url).toBe("http://localhost:9999");
  });

  test("env overrides file", async () => {
    const path = join(tmpRoot, "config.json");
    await writeFile(path, JSON.stringify({ model_default: "from-file", ollama_url: "http://file" }));
    process.env["TEAMBRAIN_CONFIG"] = path;
    process.env["TEAMBRAIN_MODEL"] = "from-env";
    process.env["OLLAMA_URL"] = "http://env";
    resetConfigCache();
    const cfg = loadConfig();
    expect(cfg.model_default).toBe("from-env");
    expect(cfg.ollama_url).toBe("http://env");
  });

  test("loadConfig is cached until resetConfigCache", async () => {
    const path = join(tmpRoot, "config.json");
    await writeFile(path, JSON.stringify({ model_default: "v1" }));
    process.env["TEAMBRAIN_CONFIG"] = path;
    resetConfigCache();
    expect(loadConfig().model_default).toBe("v1");
    await writeFile(path, JSON.stringify({ model_default: "v2" }));
    expect(loadConfig().model_default).toBe("v1");
    expect(loadConfig(true).model_default).toBe("v2");
  });
});
