# PantryPal v1 — Trade-offs

**Author:** willzhgli

I staged the build into five iterations, each committed on its own (`Iteration N:`
prefixes in the log) so progress is visible. [`SCOPING.md`](SCOPING.md) is what I
committed to up front; this is what actually landed and why.

---

## Built vs. scoped

**Landed (iterations 1–5):**

- Conversational agent — Hono + Vercel AI SDK backend, React/Vite chat UI, Docker,
  streaming, all LLM calls through the AI SDK.
- LLM-driven tool use — `webSearch` (Tavily, external), `updateProfile` /
  `removeProfileFact`, `checkFeasibility`. The model decides when to call them.
- Persistent per-user memory in SQLite (equipment, diet, cuisines, allergies), keyed to
  a per-browser id, with a "Forget me" wipe (`DELETE /api/profile`).
- Opinionated "friend who cooks" persona.
- Compliance layer — a disclosure footer on every reply, health-condition
  acknowledge-and-refer, food-safety redirect, and a keyword allergen backstop with a
  warning banner.
- Equipment feasibility — the model checks a recipe against the user's kit (or a minimal
  assumed one) and adapts instead of dead-ending.

**Cut for time:**

- **Saved recipes / favourites.** This was in my committed scope and every beta
  interview asked for it. The `saved_recipes` table is designed in SCOPING; I ran out of
  time before the tools + UI.
- **Cost-aware model routing.** Every turn uses Claude Sonnet. Priya flagged per-query
  cost explicitly; I got the architecture ready (single `MODEL` constant,
  provider-agnostic AI SDK) but didn't build the classifier or the tiers.

Everything I marked "scope cut" in SCOPING (voice, grocery lists, meal planning, PDF
ingestion, onboarding UI, COPPA) stayed cut as planned.

---

## Trade-offs I made

- **`node:sqlite` over `better-sqlite3`.** Zero native build, runs on `node:24-alpine`
  unchanged. Cost: it prints an experimental warning on Node 24.
- **Allergen enforcement = keyword scan + warning banner, not a hard block.** A curated
  allergen→terms map with word-boundary matching. I chose to *warn* rather than *block*
  so a false positive doesn't eat a legitimate reply. The real guard is still the system
  prompt; this is defence-in-depth.
- **Footer on every reply, not just recipe/ingredient replies.** Detecting "is this a
  recipe response" is heuristic and inconsistent — exactly what legal warned about. A
  compact always-on footer buys guaranteed consistency for a small amount of noise.
- **Feasibility as a tool even though equipment is already in the prompt.** The value is
  the forcing function (the model has to enumerate what a dish needs) plus a structured
  signal for the UI. The model sometimes skips it and adapts from the prompt anyway; I
  accepted that.
- **Tool-driven fact extraction, no separate extraction pass.** One fewer LLM call per
  turn. Cost: capture is lossy — it depends on the model choosing to call
  `updateProfile`.
- **Profile auto-injected into the system prompt** rather than a `getProfile` tool. No
  recall round-trip; costs a few hundred tokens on every request.
- **Per-browser UUID identity, no auth.** Fast to build and keeps the data surface small
  (which suits legal's retention preference). Cost: memory is per-browser, not
  per-person — clearing storage or switching devices loses it, and "forget me" isn't a
  deletion guarantee tied to a real identity.
- **Client-side conversation history only.** No server-side transcript storage; a reload
  starts a fresh chat. Smaller data/retention surface, but no resume and no analytics.
- **`tsx` at runtime, no server build step.** Fine for the assessment, not for
  production.

---

## What I'd do next with more time

Roughly in priority order:

1. **Model routing.** Route simple turns to Claude Haiku and hard or tool-heavy turns to
   Sonnet, with a cheap classifier (or a heuristic:
   tool-call count, message length, whether the profile is in play). Log per-conversation
   cost and set a budget to tune against. This is a stated non-negotiable I didn't reach.

2. **Harden allergy enforcement into something I'd actually trust.** Three changes:
   (a) return recipes as **structured data** (ingredients as a list, not prose) so the
   allergen check is an exact set operation instead of regex on free text;
   (b) on a hit, don't just warn — re-prompt the model to fix the recipe and re-scan,
   so a violation never reaches the user;
   (c) make a known allergy genuinely un-waivable server-side, not just prompt-level.

3. **Saved recipes / favourites.** The committed-scope item I cut. The table is
   designed; it needs `saveRecipe` / `listSavedRecipes` tools and a favourites view.

4. **Real identity + an auditable deletion story.** Even a magic-link login, so memory
   follows a person across devices and "forget me" is a real, logged deletion — which
   legal needs before launch.

5. **Structured recipe rendering** (title, servings, `ingredients[]`, `steps[]`) instead
   of markdown prose. This one change unlocks a lot: exact allergen/feasibility checks,
   the grocery-list export CX asked for, "scale this to 6", and clean save-to-favourites.

6. **Server-side conversation persistence** keyed to identity, with the same
   retention/deletion rules. Enables resume, "what did we talk about last week", and the
   support analytics CX wants.

7. **An eval suite.** A dozen adversarial cases — allergy override, food-safety
   pushback, condition-tailoring, off-topic, equipment gaps — run on every prompt change,
   so persona tuning can't silently regress compliance. Right now every check is manual.

8. **Feasibility precision.** Structured `requiredEquipment` from the model (no
   disjunctive strings), a small equipment synonym/category map, and an "ask once" path
   for genuinely ambiguous kits instead of always assuming the minimal one.

9. **Voice / hands-free** (the CEO's long-term ask). The transport is already separate
   from the agent loop, so this is a speech layer over the same `/api/chat`, not a
   rewrite.

10. **Production polish.** Compile the server, pin the AI SDK deliberately (it's on a
    fast-moving v7), add structured request logging + error tracking, rate limiting, and
    a health check that actually verifies the model key.

---

## Known issues / unhandled cases

- **Allergen scan over-warns.** It fires on a reply that only *names* an allergen to
  refuse it, and it can miss unusual ingredient names.
- **The `checkFeasibility` badge is inconsistent** — the model often adapts without
  calling the tool. Behaviour is still correct; the UI signal just isn't there.
- **Disjunctive equipment strings** ("skillet or saucepan") slip past the substring
  match in the feasibility check.
- **The reply that first records an allergy doesn't warn on itself** — the scan reads
  the profile as it was at the start of the request.
- **Food-safety refusals sometimes still cite the authority's general guidance** (e.g.
  the 2-hour rule) rather than fully deferring.
- **No conversation persistence** — a page reload is a new chat (the profile persists).
- **`updateProfile` can over- or under-capture**, and there's no UI to review or edit
  stored facts — only chat or a full wipe.
- **Web search has no retry** — a Tavily failure degrades to model knowledge silently.
- **Single SQLite file**, no concurrent-instance story; the Docker image installs all
  deps and runs `tsx` (unoptimised).
