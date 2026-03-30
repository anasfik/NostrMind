# NostrMind

<p align="center">
  <img src="docs/screenshots/nostrmind-cover.png" alt="NostrMind cover" width="100%" />
</p>

**Turn Nostr noise into verified opportunities — automatically.**

NostrMind is a config-driven, AI-powered intelligence worker for Nostr.
It runs 24/7, filters high-volume relay traffic, scores relevance with your chosen AI stack, stores structured insights in SQLite, and can instantly DM you when a high-value signal appears.

Built for builders, founders, researchers, and teams that need signal fast.

---

## Why NostrMind gets attention

- **Practical ROI**: catches opportunities and trend shifts while you sleep.
- **Low-friction ops**: one JSON config, one process, one Docker compose.
- **Local-first economics**: run Ollama locally, fail over to cloud AI only when needed.
- **Agent-ready API**: query previously validated insights via a bridge endpoint.
- **Production-minded core**: deduplication, throttled AI queue, persistent history, live dashboard.

---

## Who it is for

- **Founders / GTM teams**: watch for lead intent, product mentions, competitor chatter.
- **Crypto / market analysts**: monitor specific narratives (e.g. Bitcoin L2s) with strict filtering.
- **Open-source teams**: track project mentions and community feedback in real time.
- **AI agent builders**: consume curated signals via `/bridge/query` instead of raw relay firehose.
- **Nostr power users**: tame the noise and surface only what matters to you.

---

## Core capabilities

- JSON-configured watchlists with keyword, kind, author, tag, since, and limit filters.
- Multi-provider AI scoring: `ollama`, `openai`, `openrouter`, `gemini`.
- AI failover chain using `ai.fallbackProviders`.
- SQLite-backed processed events + insights (fast local retrieval).
- Live dashboard + server-sent events stream.
- Optional NIP-17 DM notifications with customizable message templates.
- Legacy config compatibility (`nostr-claw.config.json`) for smooth migration.

---

## How it works (3-stage signal pipeline)

1. **Relay ingestion**: subscribes to configured Nostr relays.
2. **Quick filter sieve**: cheap local filtering + processed-event dedup.
3. **AI intelligence gate**: strict JSON decision (`notify`, `message`, `match_score`, actions).

Only meaningful events become insights. Everything else is dropped early for cost and speed.

---

## Quick start

### 1) Install

```bash
npm install
```

### 2) Create config

```bash
cp nostr-mind.config.json.example nostr-mind.config.json
```

### 3) Edit config

Configure:

- AI provider/model/API keys
- relays
- watchlists
- optional DM recipient (`notifications.recipientNpub`)

Reference: [nostr-mind.config.json.example](nostr-mind.config.json.example)

### 4) Run

```bash
npm run dev
```

Dashboard: http://localhost:3000

Production:

```bash
npm run build
npm start
```

---

## Docker (recommended for 24/7)

```bash
docker compose up -d --build
```

Mounts:

- `./nostr-mind.config.json` → `/app/nostr-mind.config.json` (read-only)
- `./data` → `/app/data`

Port:

- `3000:3000`

---

## AI provider modes

| Provider     | Mode  | Typical use                       |
| ------------ | ----- | --------------------------------- |
| `ollama`     | Local | Private + lowest recurring cost   |
| `openai`     | Cloud | High-quality classification       |
| `openrouter` | Cloud | Model routing + flexibility       |
| `gemini`     | Cloud | Fast, cost-effective cloud option |

Example local-first with cloud fallback:

```json
"ai": {
  "provider": "ollama",
  "fallbackProviders": ["openai", "openrouter", "gemini"],
  "rpm": 20,
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "model": "llama3.2"
  }
}
```

---

## API + dashboard

When dashboard is enabled, API is served from the same process.

- `GET /health`
- `GET /api/stats`
- `GET /api/watchlists`
- `POST /api/watchlists`
- `PATCH /api/watchlists/:id`
- `DELETE /api/watchlists/:id`
- `GET /api/insights`
- `POST /bridge/query` (agent bridge)
- `GET /api/events/stream` (live SSE)

Legacy compatibility endpoints remain available: `/watchlists`, `/insights`.

---

## DM alerts that feel actionable

When `notifications.recipientNpub` is set, NostrMind can send NIP-17 DMs for AI-approved matches.

You can customize `watchlist.messageTemplate` using placeholders like:

- `{{watchlist.name}}`
- `{{ai.message}}`
- `{{ai.score}}`
- `{{event.link}}`
- `{{event.author_link}}`
- `{{event.content_preview}}`

---

## Example watchlist ideas

- "Find posts where teams are actively hiring TypeScript backend developers."
- "Track strong mentions of my product or brand names."
- "Alert me to meaningful discussions around Bitcoin L2 scaling narratives."
- "Detect recurring complaints that reveal product gaps in a niche."

---

## Reliability notes

- Processed events are tracked per watchlist to avoid duplicate work.
- Config watchlists are seeded without overwriting dashboard-managed entries.
- AI throughput is rate-limited with a queue and backpressure handling.
- Restart after config changes.

---

## Security

- Never commit API keys or private keys.
- Treat `senderNsec` and provider credentials as secrets.
- Prefer environment-specific config handling in production.

---

## Project status

NostrMind is actively evolving. Feedback, issues, and PRs are welcome.

If you want a custom deployment or a tailored signal strategy for your team, open an issue with your use case.
