# PantryPal

A conversational AI cooking assistant — the friend you text when you're standing in
the kitchen at 6pm with no plan.

This repo is being built in iterations. See [`SCOPING.md`](SCOPING.md) for what's in
and out of scope and why.

## Status — iteration 5 (compliance layer)

Working end to end:

- React chat UI ↔ Hono backend ↔ Anthropic (Claude Sonnet), all LLM calls through the
  Vercel AI SDK
- Streaming responses, opinionated "friend who cooks" persona
- **Web search tool (Tavily).** The model decides on its own when to search — no
  hardcoded search step. The UI shows a "searching" indicator and a collapsed list of
  sources; the reply cites what it used.
- **Cross-session memory.** The assistant records durable facts a user mentions —
  equipment, dietary preferences, cuisines they love/avoid, allergies — in SQLite,
  keyed to a per-browser id, and uses them in later conversations. A "Forget me" button
  wipes everything for that browser.
- **Equipment feasibility.** Before committing to a recipe the model enumerates the
  gear it needs and calls `checkFeasibility`, which diffs that against the user's stored
  equipment (or a minimal kit if none is known). If something's missing it adapts the
  recipe or picks another — it never dead-ends on "you can't make that." The UI shows an
  "adapted for your kit" note when a recipe was changed.
- **Compliance layer.** Every reply carries an allergen/liability disclosure footer,
  appended server-side so it's in the response for any consumer. Health conditions get a
  generic acknowledgement plus a referral (no condition-tailored recipes, no "good for
  X" claims); food-safety questions (spoilage, storage life, "is this still good") are
  declined and pointed at FoodSafety.gov / USDA. A keyword backstop scans each reply
  against the user's stored allergies and shows a warning banner on a hit.
- Multi-step tool loop, capped at 5 model↔tool round-trips per reply
- Graceful degradation: no `TAVILY_API_KEY` → search off; no `x-user-id` → no memory or
  feasibility tools; a tool failure never breaks the response stream

**Not built yet** (iteration 6): cost-aware model routing (cheap model for simple turns,
stronger model for hard ones).

### Compliance notes

- The disclosure footer wording is a **placeholder** — SCOPING flags exact language as a
  question for legal.
- The allergen scan is **defense-in-depth, not a guarantee.** It's a curated keyword map
  with word-boundary matching; it can miss (unusual ingredient names) and over-warn (it
  will flag a reply that only names an allergen to refuse it). The primary mechanism is
  the allergy line in the system prompt.
- **Under-13 / COPPA is out of scope.** v1 assumes a 13+ audience; there is no age gate.
- Allergies are stored (treated as safety-critical); medical conditions are never stored
  (there is no profile category for them).

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
