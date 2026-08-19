# soko-tg-bot

Telegram alerts for **Sokosumi org human DMs** via Core API + user API key.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) → `TELEGRAM_BOT_TOKEN`
2. Sokosumi → Developer → API Keys → `SOKOSUMI_API_KEY`
3. Your org slug (from the org URL) → `SOKOSUMI_ORG_SLUG`
4. Message your bot once, then copy your chat id into `TELEGRAM_ALLOWED_CHAT_IDS`

```bash
cp .env.example .env
pnpm install
pnpm dev
```

## Commands

- `/rooms` — list human DMs (numbered)
- `/read <n|roomId>` — recent messages
- `/send <n|roomId> <text>` — reply
- `/status` — poll interval

New messages push automatically (default **3s** poll via `POLL_INTERVAL_MS`). Each alert includes an **Open in Sokosumi** button → `/chat/rooms/{roomId}` on the web app.

## Notes

- Human-only directs: coworker DMs are ignored
- First run seeds state — no backlog spam
- Uses `https://core.sokosumi.com` unless `SOKOSUMI_CORE_BASE_URL` is set
