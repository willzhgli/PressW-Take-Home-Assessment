import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { env, logEnvSummary } from "./env";
import { SYSTEM_PROMPT } from "./prompt";
import { webSearch } from "./tools/webSearch";

// Single model for now. Cost-aware routing (Haiku/Sonnet tiers) comes later.
const MODEL = "claude-sonnet-5";

// Upper bound on model<->tool round-trips in one reply. The model decides when
// to call tools; this just stops a pathological loop.
const MAX_STEPS = 5;

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>();

  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { webSearch },
    stopWhen: stepCountIs(MAX_STEPS),
    onError: ({ error }) => console.error("streamText error:", error),
  });

  return result.toUIMessageStreamResponse();
});

logEnvSummary();
serve({ fetch: app.fetch, port: env.port });
console.log(`pantrypal-server listening on :${env.port}`);
