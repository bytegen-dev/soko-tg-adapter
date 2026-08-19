# soko-tg-adapter

Telegram alerts for Sokosumi **direct messages** and **org channels**. Covers human DMs, coworker 1:1 (e.g. Alex), and channels you belong to.

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

Open your bot in Telegram → **`/start`**. First start links your chat. Use the menu buttons at the bottom (Chats, Settings, Help, Status).

## Commands

- `/rooms` - list DMs and channels
- `/read 1` - open a chat; tap **Older messages** for history
- `/send 1 hello` - reply
- `/settings` - mute chats, mute all, manage alerts
- `/help` - full command list

Alerts every ~3s with **View chat**, **Open in Sokosumi**, and **Mute chat** buttons.

## Development

```bash
pnpm typecheck   # types only (runs on pre-commit)
pnpm build       # compile to dist/ (runs on pre-push)
pnpm check       # both
```

Husky hooks run automatically after `pnpm install`.
