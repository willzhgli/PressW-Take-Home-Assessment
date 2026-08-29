/**
 * Central place to read and validate process env.
 *
 * Philosophy: don't crash on a missing key. The server still boots so `/health`
 * works and dev stays low-friction; a missing/invalid ANTHROPIC_API_KEY surfaces
 * as a graceful per-request error, and web search simply turns off when
 * TAVILY_API_KEY is absent (the model falls back to its own knowledge).
 *
 * DB_PATH always has a default (server/data/pantrypal.db), resolved relative to
 * this file so it doesn't depend on the current working directory.
 */

import path from "node:path";

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const anthropicApiKey = read("ANTHROPIC_API_KEY");
const tavilyApiKey = read("TAVILY_API_KEY");
const port = Number(process.env.PORT ?? 3000);
const dbPath =
  read("DB_PATH") ??
  path.join(import.meta.dirname, "..", "data", "pantrypal.db");

export const env = {
  anthropicApiKey,
  tavilyApiKey,
  port,
  dbPath,
  /** Web search is available only when a Tavily key is configured. */
  webSearchEnabled: tavilyApiKey !== undefined,
} as const;

/** One-time startup summary so the operator can see what's wired up. */
export function logEnvSummary(): void {
  const lines = [
    anthropicApiKey
      ? "  ANTHROPIC_API_KEY  set"
      : "  ANTHROPIC_API_KEY  MISSING — chat requests will fail until it is set",
    env.webSearchEnabled
      ? "  TAVILY_API_KEY     set — web search enabled"
      : "  TAVILY_API_KEY     not set — web search disabled (answers from model knowledge only)",
    `  DB_PATH           ${env.dbPath}`,
  ];
  console.log(`pantrypal-server config:\n${lines.join("\n")}`);
}
