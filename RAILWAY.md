# Railway deployment

Long-running Telegram bot (polling). Deploy **one replica only** or you will get duplicate alerts.

## Quick deploy

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select `soko-tg-adapter`
2. Railway reads `railway.json` and builds with the repo `Dockerfile`
3. Set environment variables (see below)
4. Add a **volume** mounted at `/data` so mute settings and poll cursors survive redeploys
5. Deploy

## Required environment variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Your Telegram chat ID (`pnpm get-chat-id`) |
| `SOKOSUMI_API_KEY` | Sokosumi developer API key |
| `SOKOSUMI_ORG_SLUG` | Your organization slug |

## Recommended for production

| Variable | Value | Notes |
|----------|-------|-------|
| `STATE_DATA_DIR` | `/data` | Match the volume mount path |
| `NODE_ENV` | `production` | Set in Dockerfile already |

## Optional

| Variable | Default |
|----------|---------|
| `SOKOSUMI_CORE_BASE_URL` | `https://api.sokosumi.com` |
| `SOKOSUMI_WEB_BASE_URL` | `https://app.sokosumi.com` |
| `POLL_INTERVAL_MS` | `3000` |
| `PORT` | `8080` (Railway may override) |

## Volume

Without a volume, `.data/state.json` is lost on every deploy (mutes, quiet hours, last-notified IDs reset).

In Railway:

1. Service → **Volumes** → **Add Volume**
2. Mount path: `/data`
3. Set `STATE_DATA_DIR=/data`

## Health check

The bot exposes `GET /health` on `PORT` for Railway health checks. Telegram polling runs in the same process.

## Local production smoke test

```bash
pnpm build
TELEGRAM_BOT_TOKEN=... TELEGRAM_ALLOWED_CHAT_IDS=... SOKOSUMI_API_KEY=... SOKOSUMI_ORG_SLUG=... pnpm start
```

## CLI deploy

```bash
railway login
railway link
railway up
```

Set secrets with `railway variables set TELEGRAM_BOT_TOKEN=...` etc.

## After deploy

Message your bot **`/start`** in Telegram (your chat must be in `TELEGRAM_ALLOWED_CHAT_IDS`).

Check logs: `railway logs` — expect `[sokosumi] authenticated`, `[health] listening`, `[bot] @... listening`.
