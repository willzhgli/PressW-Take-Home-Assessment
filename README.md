# PantryPal

A conversational AI cooking assistant — the friend you text when you're standing in
the kitchen at 6pm with no plan.

Built in iterations across the assessment window. See [`SCOPING.md`](SCOPING.md) for
what's in and out of scope and why.

## Iterations

1. **Walking skeleton** — streaming chat end to end: React UI ↔ Hono ↔ Claude (Sonnet)
   through the Vercel AI SDK, an opinionated "friend who cooks" persona, Docker.
2. **Tools + agent loop** — Tavily web search as a tool the model chooses to call (no
   hardcoded search step), a multi-step tool loop, and a "searching" indicator plus
   cited sources in the UI.
3. **Memory** — a per-browser id (`x-user-id`); the model records equipment, dietary
   preferences, cuisines and allergies to SQLite and uses them across sessions; a
   "Forget me" button (`DELETE /api/profile`) wipes it.
4. **Feasibility + persona** — `checkFeasibility` diffs the equipment a recipe needs
   against what the user has stored (or a minimal assumed kit); on a gap the model
   adapts the recipe or picks another instead of dead-ending, with an "adapted for your
   kit" badge.
5. **Compliance layer** — a disclosure footer appended server-side to every reply;
   health conditions get a generic acknowledgement + referral (no condition-tailored
   recipes, no "good for X" claims); food-safety questions are declined and pointed at
   FoodSafety.gov / USDA; a keyword allergen backstop scans each reply against stored
   allergies and shows a warning banner on a hit.

**Not reached:** iteration 6 — cost-aware model routing (a cheap model for simple turns,
a stronger one for hard ones).

## What it does

- React chat UI ↔ Hono backend ↔ Anthropic (Claude Sonnet), all LLM calls through the
  Vercel AI SDK, streamed
- Opinionated "friend who cooks" persona
- **Web search (Tavily)** — model-decided, with a "searching" indicator and a collapsed
  source list; the reply cites what it used
- **Cross-session memory** in SQLite, keyed to a per-browser id, with a "Forget me" wipe
- **Equipment feasibility** — the model checks a recipe against the user's kit and
  adapts rather than refusing
- **Compliance** — per-reply disclosure footer, health-condition and food-safety
  redirects, and a keyword allergen backstop with a warning banner
- Multi-step tool loop, capped at 5 model↔tool round-trips per reply
- Graceful degradation: no `TAVILY_API_KEY` → search off; no `x-user-id` → no memory or
  feasibility tools; a tool failure never breaks the response stream

## Known limitations

- The disclosure footer wording is a **placeholder** — SCOPING flags exact language as a
  question for legal.
- The allergen scan is **defense-in-depth, not a guarantee.** It's a curated keyword map
  with word-boundary matching; it can miss (unusual ingredient names) and over-warn (it
  will flag a reply that only names an allergen to refuse it). The primary mechanism is
  the allergy line in the system prompt.
- **Under-13 / COPPA is out of scope.** v1 assumes a 13+ audience; there is no age gate.
- Allergies are stored (treated as safety-critical); medical conditions are never stored
  (there is no profile category for them).
- **Feasibility is best-effort.** The model doesn't always call `checkFeasibility` — with
  the equipment already in its prompt it often just adapts directly (behaviour stays
  correct, the badge just doesn't show). Equipment matching is normalized substring, so
  a disjunctive value the model passes ("skillet or saucepan") can miss.
- **Fact extraction is lossy.** Whether a stated preference gets recorded depends on the
  model calling `updateProfile`; the allergen scan reads the profile as of request
  start, so the reply that first records an allergy won't warn on itself.
- **One model, no routing.** Every turn uses Claude Sonnet; the cost-aware cheap/strong
  split (iteration 6) was not built.
- Conversation history is client-side only — a page reload starts a fresh chat (the
  profile persists).

## Run it

You need an Anthropic API key (required) and optionally a Tavily key (for web search):

- **Anthropic** — <https://console.anthropic.com/settings/keys>
- **Tavily** — <https://app.tavily.com> (free tier, ~1,000 searches/month)

### With Docker (recommended)

```bash
cp .env.example .env        # paste your key(s) into .env
docker compose up --build
```

- UI: http://localhost:5173
- API: http://localhost:3000 (`GET /health`, `POST /api/chat`, `DELETE /api/profile`)

The SQLite database lives in the named volume `pantrypal-data` and survives
`docker compose down`. To wipe it: `docker compose down -v`.

### Locally (Node 24+)

```bash
cp .env.example .env        # paste your key(s)

# terminal 1 — backend (reads ../.env automatically)
cd server && npm install && npm run dev

# terminal 2 — frontend
cd web && npm install && npm run dev
```

No shell `export` needed — the server scripts load `../.env` via
`tsx --env-file-if-exists`. The database is written to `server/data/pantrypal.db`
(git-ignored); delete that file to reset.

## Try it

Direct answer, no search:

```bash
curl -N http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"what can I substitute for buttermilk?"}]}]}'
```

Triggers a web search (watch for `tool-input-available` / `tool-output-available` in
the stream):

```bash
curl -N http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"who won the James Beard Best New Restaurant award in 2024?"}]}]}'
```

Memory — send an `x-user-id`, state a fact, then ask again in a *separate* request
with the same id:

```bash
curl -N http://localhost:3000/api/chat -H 'content-type: application/json' \
  -H 'x-user-id: demo-1' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"just so you know, I am vegetarian and only have a hot plate"}]}]}'

curl -N http://localhost:3000/api/chat -H 'content-type: application/json' \
  -H 'x-user-id: demo-1' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"what should I make for dinner?"}]}]}'

curl -X DELETE http://localhost:3000/api/profile -H 'x-user-id: demo-1'   # forget me
```

The chat response is an AI SDK UI-message stream (Server-Sent Events).

## Memory model

- **Identity:** the frontend generates a UUID on first load, stores it in
  `localStorage`, and sends it as the `x-user-id` header. No accounts, no login.
- **Stored categories:** `equipment`, `diet_preference`, `cuisine_like`,
  `cuisine_dislike`, `allergy`. Recorded when the model calls its `updateProfile` tool;
  read back by injecting a summary block into the system prompt each request.
- **Not stored:** there is deliberately no category for medical conditions — the model
  has no slot to persist one.
- **Deletion:** `DELETE /api/profile` (the "Forget me" button) removes every fact for
  that id.

## Layout

```
server/          Hono + Vercel AI SDK
  src/index.ts           POST /api/chat (composed stream), DELETE /api/profile
  src/prompt.ts          persona + health/safety rules + buildSystemPrompt(profile)
  src/env.ts             reads ANTHROPIC_API_KEY / TAVILY_API_KEY / PORT / DB_PATH
  src/db.ts              opens node:sqlite, creates the profile_facts schema
  src/profile.ts         profile CRUD (getFacts / addFact / removeFact / wipeUser)
  src/compliance.ts      disclosure footer text + scanForAllergens keyword backstop
  src/tools/webSearch.ts  Tavily-backed web search tool (never throws; returns {error})
  src/tools/profile.ts    updateProfile / removeProfileFact tools (per-request, per-user)
  src/tools/feasibility.ts checkFeasibility — diffs a recipe's needs against stored equipment
web/             React + Vite
  src/App.tsx            chat UI; web-search, feasibility, disclosure, allergen-warning, "Forget me"
  src/useUserId.ts       per-browser id in localStorage
docker-compose.yml       server + web; named volume pantrypal-data for the DB
```

## Config

| Variable            | Where            | Purpose                                                     |
| ------------------- | ---------------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | server (`.env`)  | **required** — Anthropic API access                       |
| `TAVILY_API_KEY`    | server (`.env`)  | optional — enables the web search tool; unset disables it |
| `DB_PATH`           | server           | SQLite file path, default `server/data/pantrypal.db`      |
| `PORT`              | server           | API port, default `3000`                                  |
| `VITE_API_URL`      | web (build time) | backend origin, default `http://localhost:3000`           |
