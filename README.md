# soko-tg-adapter

Telegram alerts for Sokosumi **direct messages** and **org channels**. Covers human DMs, coworker 1:1 (e.g. Alex), and channels you belong to.

## Setup (3 things)

1. **Telegram** — [@BotFather](https://t.me/BotFather) → `/newbot` → copy token → message the bot → `pnpm get-chat-id` → set `TELEGRAM_ALLOWED_CHAT_IDS`
2. **Sokosumi** — Developer → API Keys + your org slug
3. **`.env`**

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_CHAT_IDS=123456789
SOKOSUMI_API_KEY=...
SOKOSUMI_ORG_SLUG=...
```

```bash
pnpm install
pnpm dev
```

Open your bot in Telegram → **`/start`**. Use the inline buttons on the welcome message (Chats, Settings, Help, Status).

## Security

`TELEGRAM_ALLOWED_CHAT_IDS` is **required**. The bot will not start without it.

- Only listed chat IDs can run commands or receive alerts
- Everyone else gets **"This bot is private."**
- Use a **dedicated** BotFather token (do not share with other adapters)

```bash
pnpm get-chat-id   # message the bot first, then run this
```

## Commands

- `/rooms` - list DMs and channels
- `/read 1` - open a chat; tap **Older** for history
- Tap **Reply** in a chat, type your message, send
- `/send 1 hello` - send without opening the chat
- `/cancel` - stop an in-progress reply
- `/settings` - mute chats, quiet hours, mute all
- `/help` - full command list

Alerts every ~3s with **View chat**, **Open in Sokosumi**, and **Mute chat** buttons.

## Development

```bash
pnpm typecheck   # types only (runs on pre-commit)
pnpm build       # compile to dist/ (runs on pre-push)
pnpm check       # both
```

Husky hooks run automatically after `pnpm install`.

## Railway

Deploy as a single worker service with a `/data` volume. See **[RAILWAY.md](./RAILWAY.md)** for env vars and setup.
