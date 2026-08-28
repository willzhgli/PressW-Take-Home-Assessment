import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "./prompt";

// Single model for iteration 1. Cost-aware routing (Haiku/Sonnet tiers) comes later.
const MODEL = "claude-sonnet-5";

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: UIMessage[] }>();

  const result = streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`pantrypal-server listening on :${port}`);
