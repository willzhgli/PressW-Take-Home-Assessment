# PantryPal

A conversational AI cooking assistant — the friend you text when you're standing in
the kitchen at 6pm with no plan.

This repo is being built in iterations. See [`SCOPING.md`](SCOPING.md) for what's in
and out of scope and why.

## Status — iteration 2 (tools + agent loop)

Working end to end:

- React chat UI ↔ Hono backend ↔ Anthropic (Claude Sonnet), all LLM calls through the
  Vercel AI SDK
- Streaming responses, opinionated "friend who cooks" persona
- **Web search tool (Tavily).** The model decides on its own when to search — there is
  no hardcoded search step. The UI shows a "searching" indicator and a collapsed list
  of sources; the reply cites what it used.
- Multi-step tool loop, capped at 5 model↔tool round-trips per reply
- Graceful degradation: no `TAVILY_API_KEY` → search turns off, the model just answers
  from its own knowledge; a search failure never breaks the response stream

**Not built yet** (later iterations): memory / cross-session continuity, equipment-aware
feasibility checks, the allergen + health-safety compliance layer, cost-aware model
routing. Don't rely on any of that yet.

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
- API: http://localhost:3000 (`GET /health`, `POST /api/chat`)

### Locally (Node 24+)

```bash
cp .env.example .env        # paste your key(s)

# terminal 1 — backend (reads ../.env automatically)
cd server && npm install && npm run dev

# terminal 2 — frontend
cd web && npm install && npm run dev
```

No shell `export` needed — the server scripts load `../.env` via
`tsx --env-file-if-exists`.

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

The response is an AI SDK UI-message stream (Server-Sent Events).

## Layout

```
server/          Hono + Vercel AI SDK
  src/index.ts          POST /api/chat -> streamText(tools, stopWhen) -> UI message stream
  src/prompt.ts          the persona system prompt
  src/env.ts             reads + validates ANTHROPIC_API_KEY / TAVILY_API_KEY / PORT
  src/tools/webSearch.ts  Tavily-backed web_search tool (never throws; returns {error})
web/             React + Vite
  src/App.tsx            useChat() chat UI + web-search rendering
docker-compose.yml
```

## Config

| Variable            | Where            | Purpose                                                        |
| ------------------- | ---------------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | server (`.env`)  | **required** — Anthropic API access                           |
| `TAVILY_API_KEY`    | server (`.env`)  | optional — enables the web search tool; unset disables it     |
| `PORT`              | server           | API port, default `3000`                                      |
| `VITE_API_URL`      | web (build time) | backend origin, default `http://localhost:3000`               |
