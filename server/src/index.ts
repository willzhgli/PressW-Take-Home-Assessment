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
import { buildSystemPrompt } from "./prompt";
import { getGroupedProfile, wipeUser } from "./profile";
import { webSearch } from "./tools/webSearch";
import { createProfileTools } from "./tools/profile";

// Single model for now. Cost-aware routing (Haiku/Sonnet tiers) comes later.
const MODEL = "claude-sonnet-5";

// Upper bound on model<->tool round-trips in one reply. The model decides when
// to call tools; this just stops a pathological loop.
const MAX_STEPS = 5;

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/api/chat", async (c) => {
  const userId = c.req.header("x-user-id")?.trim() || undefined;
  const { messages } = await c.req.json<{ messages: UIMessage[] }>();

  const profile = userId ? getGroupedProfile(userId) : null;

  const result = streamText({
    model: anthropic(MODEL),
    system: buildSystemPrompt(profile),
    messages: await convertToModelMessages(messages),
    tools: {
      webSearch,
      // Memory tools only when we have someone to remember.
      ...(userId ? createProfileTools(userId) : {}),
    },
    stopWhen: stepCountIs(MAX_STEPS),
    onError: ({ error }) => console.error("streamText error:", error),
  });

  return result.toUIMessageStreamResponse();
});

// Wipe everything stored for the caller (the "forget me" control in the UI).
app.delete("/api/profile", (c) => {
  const userId = c.req.header("x-user-id")?.trim();
  if (!userId) return c.json({ error: "missing x-user-id header" }, 400);
  return c.json({ removed: wipeUser(userId) });
});

logEnvSummary();
serve({ fetch: app.fetch, port: env.port });
console.log(`pantrypal-server listening on :${env.port}`);
