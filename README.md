# soko-tg-adapter

Telegram alerts for Sokosumi **direct messages** — org human DMs and **coworker 1:1** (e.g. Alex).

## Setup (3 things)

1. **Telegram** — [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. **Sokosumi** — Developer → API Keys + your org slug
3. **`.env`**

```env
TELEGRAM_BOT_TOKEN=...
SOKOSUMI_API_KEY=...
SOKOSUMI_ORG_SLUG=...
```

```bash
pnpm install
pnpm dev
```

Open your bot in Telegram → **`/start`**. First start links your chat. Done.

## Commands

- `/rooms` — list DMs
- `/read 1` — messages
- `/send 1 hello` — reply

Alerts every ~3s with an **Open in Sokosumi** button.
