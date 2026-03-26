# Nostr-Claw

Nostr-Claw is an 24/7 AI agent designed to monitor Nostr relays and provide intelligent insights based on your criteria and use-case, It continuously watches relays, applies your Watch Lists, runs AI evaluation on matched events, stores results in SQLite, and can notify a target account via NIP-17 direct messages.

---

## Features

- 24/7 monitoring of Nostr relays
- AI evaluation of events based on customizable instructions, as example:
  - "I am interested in Financial news"
  - "see who is talking about Github"
  - "I want to know about new Nostr clients"
  - "Alert me on any mentions of @guy or #nostrclaw"
  - "I want to track discussions about Bitcoin and Ethereum, but not other cryptocurrencies"
- Notification system based NIP-17 DMs to a specified npub
- Persistent storage of watchlists, processed events, and insights in SQLite
- Dockerized for easy deployment

---

## Capabilities and support

### AI providers

- OpenAI
- OpenRouter
- ( More to come, pluggable architecture )

### Notification Channels

- NIP-17 DMs (via configured notifier identity)
- ( More channels like email, webhooks, etc. planned for future )

## Installation (Docker)

1. Clone repository.
2. Create env file:

```bash
cp .env.example .env
```

3. Edit `.env` values (see Configuration).
4. Build and start:

```bash
docker compose up -d --build
```

Default API address: `http://localhost:8080`

---

## Configuration

All configuration is done through environment variables.

### Core

- `NODE_ENV`
- `HOST` (default `0.0.0.0`)
- `PORT` (default `8080`)
- `LOG_LEVEL` (default `info`)
- `LOG_FILE_PATH` (default `./log.txt`)
- `DB_PATH` (default `./nostr-claw.sqlite`)

### Relay configuration

- `NOSTR_RELAYS` (comma-separated relay URLs)

Example:

```env
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol
```

### AI configuration

- `AI_PROVIDER` (`openai` or `openrouter`)
- OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
- OpenRouter:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
- `AI_RPM` (`0` disables rate limiting)

### Notification configuration

- `NOTIFY_RECIPIENT_NPUB` (target account for DMs)

### Pipeline refresh

- `WATCHLIST_REFRESH_MS`

---

## Usage

Nostr-Claw runs as a long-lived service. You interact with it via HTTP endpoints.

### Main flow

1. Start service
2. Create one or more watchlists
3. Let pipeline process events in real time
4. Read insights from API
5. Receive NIP-17 notifications (if enabled)

### API endpoints

- `GET /health`
- `GET /watchlists`
- `POST /watchlists`
- `PATCH /watchlists/:id`
- `GET /insights`
- `POST /bridge/query`

---

## Operational notes

- SQLite contains service state and generated notifier identity.
- DM visibility on clients depends on relay overlap and client inbox/request policies.
- If notifications are enabled, ensure `NOTIFY_RECIPIENT_NPUB` is the exact account you check.
