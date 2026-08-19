/**
 * Read TELEGRAM_BOT_TOKEN from .env (via node --env-file) and print chat ids
 * from recent messages sent to your bot. Run after messaging the bot on Telegram.
 *
 *   pnpm get-chat-id
 */

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const response = await fetch(
  `https://api.telegram.org/bot${token}/getUpdates`,
);
const data = await response.json();

if (!data.ok) {
  console.error("Telegram API error:", data.description ?? data);
  process.exit(1);
}

const updates = data.result ?? [];
if (updates.length === 0) {
  console.log("No messages yet.");
  console.log("");
  console.log("1. Open your bot in Telegram (link from @BotFather)");
  console.log("2. Tap Start, then send: hi");
  console.log("3. Run: pnpm get-chat-id");
  process.exit(0);
}

const chatIds = new Map();
for (const update of updates) {
  const message = update.message ?? update.edited_message;
  if (!message?.chat?.id) continue;
  const chat = message.chat;
  chatIds.set(chat.id, {
    id: chat.id,
    type: chat.type,
    label:
      chat.first_name ??
      chat.username ??
      chat.title ??
      String(chat.id),
  });
}

console.log("Put one of these in .env as TELEGRAM_ALLOWED_CHAT_IDS:\n");
for (const entry of chatIds.values()) {
  console.log(`  ${entry.id}   (${entry.type}: ${entry.label})`);
}
