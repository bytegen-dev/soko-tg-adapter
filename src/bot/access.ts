import type { Context } from "grammy";

import type { Config } from "../config.js";

/** Chat ids that receive alerts and can run commands (from env only). */
export function getAllowedChatIds(config: Config): string[] {
  return config.TELEGRAM_ALLOWED_CHAT_IDS;
}

/** Reject any Telegram chat not listed in TELEGRAM_ALLOWED_CHAT_IDS. */
export async function ensureAllowed(
  ctx: Context,
  config: Config,
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return false;
  }

  const id = String(chatId);
  if (getAllowedChatIds(config).includes(id)) {
    return true;
  }

  console.warn(`[bot] rejected chat ${id} (not in allowlist)`);
  await ctx.reply("This bot is private.");
  return false;
}
