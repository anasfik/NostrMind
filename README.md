# Nostr-Claw

Nostr-Claw is a config-driven Nostr monitoring worker powered by AI. It connects to relays, watches for events matching your watchlist filters, evaluates them with AI, and sends DM notifications for matches. All behavior is controlled by a single JSON config file.

You:

1. Edit one JSON file.
2. Start (or restart) the worker.
3. Receive AI-filtered Nostr matches as NIP-17 DMs.

---

## What it does

- Connects to Nostr relays
- Watches events using your watchlist filters
- Runs AI evaluation on matching events
- Stores processed state and insights in SQLite
- Sends organized DM notifications to your recipient npub

---

## Quick start

1. Copy the example config:

```bash
cp nostr-claw.config.json.example nostr-claw.config.json
```

2. Edit [nostr-claw.config.json](nostr-claw.config.json):
   - AI provider and API key
   - notification recipient npub
   - watchlists and filters

3. Run:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

---

## Config file (important fields)

Default config path: [nostr-claw.config.json](nostr-claw.config.json), example:

```json
{
  "nodeEnv": "development",
  "logLevel": "info",
  "logFilePath": "./log.txt",
  "dbPath": "./data/nostr-claw.sqlite",
  "nostrRelays": [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol"
  ],
  "ai": {
    "provider": "openrouter",
    "rpm": 40,
    "openrouter": {
      "apiKey": "YOUR_OPENROUTER_API_KEY",
      "model": "stepfun/step-3.5-flash:free"
    }
  },
  "notifications": {
    "recipientNpub": "YOUR_RECIPIENT_NPUB"
  },
  "watchlists": [
    {
      "id": "crypto",
      "name": "crypto",
      "prompt": "Alert me about any news related to cryptocurrencies",
      "active": true,
      "filters": {
        "kinds": [1],
        "limit": 1
      }
    },
    {
      "id": "web3",
      "name": "web3",
      "prompt": "Alert me about any news related to web3 and blockchain technology",
      "active": true,
      "filters": {
        "kinds": [1],
        "since": 1735689600,
        "limit": 1
      }
    },
    {
      "id": "fiatjaf",
      "name": "specific account, fiatjaf",
      "prompt": "Alert me about any posts from the account @fiatjaf, his npub: npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
      "active": true,
      "filters": {
        "kinds": [1],
        "limit": 1
      }
    },
    {
      "id": "listings",
      "name": "listings",
      "prompt": "all listingns where people offer to sell something, I want to see what people try to give, sell, or trade on nostr",
      "active": true,
      "filters": {
        "kinds": [30402],
        "limit": 1
      }
    }
  ]
}
```

## Docker

After creating your config:

```bash
docker compose up -d --build
```

Compose mounts:

- [nostr-claw.config.json](nostr-claw.config.json) → `/app/nostr-claw.config.json`
- `./data` → persistent SQLite data

## Notes

- After changing config, restart the worker.
- Watchlists removed from config are disabled in DB on next startup.
- DM visibility depends on relay overlap and client inbox behavior.
- Keep your API keys and private keys secret.
