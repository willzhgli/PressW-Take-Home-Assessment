import { tool } from "ai";
import { z } from "zod";
import { env } from "../env";

/**
 * Web search tool, backed by Tavily (https://docs.tavily.com).
 *
 * The model decides when to call this — there is no hardcoded search step.
 * Failures (no key, timeout, HTTP error, empty results) are *returned* as
 * `{ error }` rather than thrown, so the model can gracefully tell the user it
 * couldn't look something up and fall back to its own knowledge, instead of the
 * response stream erroring out mid-turn.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_RESULTS = 5;
const SNIPPET_MAX_CHARS = 500;
const TIMEOUT_MS = 8_000;

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "A focused search query, e.g. \"what stone fruit is in season in California in August\".",
    ),
});

interface TavilyResponse {
  answer?: string;
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearchResult =
  | { answer?: string; results: WebSearchHit[] }
  | { error: string };

/** Raw wrapper around the Tavily search endpoint. Never throws. */
export async function runWebSearch(query: string): Promise<WebSearchResult> {
  if (!env.tavilyApiKey) {
    return {
      error:
        "Web search is not configured (no TAVILY_API_KEY). Answer from your own knowledge and tell the user you couldn't look it up.",
    };
  }

  let res: Response;
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.tavilyApiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: MAX_RESULTS,
        search_depth: "basic",
        include_answer: true,
        topic: "general",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const reason = name === "TimeoutError" ? "timed out" : "failed to connect";
    return {
      error: `Web search ${reason}. Answer from your own knowledge and note that you couldn't look it up.`,
    };
  }

  if (!res.ok) {
    return {
      error: `Web search returned HTTP ${res.status}. Answer from your own knowledge and note that you couldn't look it up.`,
    };
  }

  let data: TavilyResponse;
  try {
    data = (await res.json()) as TavilyResponse;
  } catch {
    return { error: "Web search returned an unreadable response." };
  }

  const results: WebSearchHit[] = (data.results ?? [])
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      title: r.title?.trim() || "(untitled)",
      url: r.url?.trim() ?? "",
      snippet: (r.content ?? "").trim().slice(0, SNIPPET_MAX_CHARS),
    }))
    .filter((r) => r.url !== "");

  const answer = data.answer?.trim();

  if (results.length === 0 && !answer) {
    return { error: "Web search found nothing useful for that query." };
  }

  return answer ? { answer, results } : { results };
}

export const webSearch = tool({
  description:
    "Search the web for current or specific information you are not confident you already know. Good for: what produce is in season right now, specific named recipes / restaurants / products, recent food news, regional availability, anything time-sensitive. Do NOT use it for general cooking knowledge you already have (doneness temperatures, common substitutions, basic technique). Prefer one focused search over several.",
  inputSchema,
  execute: async ({ query }) => runWebSearch(query),
});
