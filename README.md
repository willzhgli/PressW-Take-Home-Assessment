# PantryPal

A conversational AI cooking assistant — the friend you text when you're standing in
the kitchen at 6pm with no plan.

This repo is being built in iterations. See [`SCOPING.md`](SCOPING.md) for what's in
and out of scope and why.

## Status — iteration 1 (walking skeleton)

Working end to end:

- React chat UI ↔ Hono backend ↔ Anthropic (Claude Sonnet), all LLM calls through the
  Vercel AI SDK
- Streaming responses
- An opinionated "friend who cooks" persona

**Not built yet** (later iterations): tools / web search, memory, equipment-aware
feasibility checks, the allergen + health-safety compliance layer, cost-aware model
routing. Don't rely on any of that yet.

## Run it

### With Docker (recommended)

```bash
cp .env.example .env        # then paste your Anthropic API key into .env
docker compose up --build
```

- UI: http://localhost:5173
- API: http://localhost:3000 (`GET /health`, `POST /api/chat`)

### Locally (Node 24+)

```bash
cp .env.example .env        # paste your key

# terminal 1 — backend
cd server && npm install && ANTHROPIC_API_KEY=$(grep -v '^#' ../.env | xargs) npm run dev

# terminal 2 — frontend
cd web && npm install && npm run dev
```

On Windows PowerShell, set the key with `$env:ANTHROPIC_API_KEY="sk-ant-..."` before
`npm run dev` in the server folder.

## Try it

```bash
curl -N http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"I have chicken thighs, rice, and a lime. what do I make?"}]}]}'
```

The response is an AI SDK UI-message stream (Server-Sent Events).

## Layout

```
server/          Hono + Vercel AI SDK
  src/index.ts     POST /api/chat  -> streamText(...).toUIMessageStreamResponse()
  src/prompt.ts    the persona system prompt
web/             React + Vite
  src/App.tsx      useChat() chat UI
docker-compose.yml
```

## Config

| Variable            | Where            | Purpose                                  |
| ------------------- | ---------------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY` | server (`.env`)  | required — Anthropic API access          |
| `PORT`              | server           | API port, default `3000`                 |
| `VITE_API_URL`      | web (build time) | backend origin, default `http://localhost:3000` |
