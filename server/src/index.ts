import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { env, logEnvSummary } from "./env";
import { ALLERGEN_FOOTER, scanForAllergens } from "./compliance";
import { buildSystemPrompt } from "./prompt";
import { getGroupedProfile, wipeUser } from "./profile";
import { webSearch } from "./tools/webSearch";
import { createProfileTools } from "./tools/profile";
import { createFeasibilityTool } from "./tools/feasibility";

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
      // Per-user tools (memory + feasibility) need a user id to read/write against.
      ...(userId ? createProfileTools(userId) : {}),
      ...(userId ? createFeasibilityTool(userId) : {}),
    },
    stopWhen: stepCountIs(MAX_STEPS),
    onError: ({ error }) => console.error("streamText error:", error),
  });

  // Compose the model's stream, then append compliance parts once it finishes:
  // a keyword allergen backstop (warning, not a block) and the disclosure footer.
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(toUIMessageStream({ stream: result.stream }));

      const finalText = await result.text;

      const allergies = profile?.allergy ?? [];
      if (allergies.length > 0) {
        const hits = scanForAllergens(finalText, allergies);
        if (hits.length > 0) {
          console.warn(
            `allergen scan hit (user=${userId}):`,
            hits.map((h) => `${h.allergy}:[${h.terms.join(",")}]`).join(" "),
          );
          writer.write({ type: "data-allergenWarning", data: { hits } });
        }
      }

      writer.write({ type: "data-disclaimer", data: { text: ALLERGEN_FOOTER } });
    },
    onError: (err) => {
      console.error("ui stream error:", err);
      return "An error occurred.";
    },
  });

  return createUIMessageStreamResponse({ stream });
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
