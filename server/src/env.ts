/**
 * Central place to read and validate process env.
 *
 * Philosophy: don't crash on a missing key. The server still boots so `/health`
 * works and dev stays low-friction; a missing/invalid ANTHROPIC_API_KEY surfaces
 * as a graceful per-request error, and web search simply turns off when
 * TAVILY_API_KEY is absent (the model falls back to its own knowledge).
 */

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const anthropicApiKey = read("ANTHROPIC_API_KEY");
const tavilyApiKey = read("TAVILY_API_KEY");
const port = Number(process.env.PORT ?? 3000);

export const env = {
  anthropicApiKey,
  tavilyApiKey,
  port,
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
  ];
  console.log(`pantrypal-server config:\n${lines.join("\n")}`);
}
