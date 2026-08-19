import type { Context } from "grammy";

import type { Config } from "../config.js";
import type { StateStore } from "../state.js";

/** Chat ids that receive alerts and can run commands. */
export function getAllowedChatIds(
  config: Config,
  state: StateStore,
): string[] {
  return [
    ...new Set([
      ...config.TELEGRAM_ALLOWED_CHAT_IDS,
      ...state.snapshot.registeredChatIds,
    ]),
  ];
}

/**
 * Allow env-listed chats, saved chats, or auto-register the first /start
 * when nothing is configured yet (personal bot — no getUpdates step).
 */
export async function ensureAllowed(
  ctx: Context,
  config: Config,
  state: StateStore,
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return false;
  }

  const id = String(chatId);
  const allowed = getAllowedChatIds(config, state);

  if (allowed.includes(id)) {
    return true;
  }

  const hasEnvAllowlist = config.TELEGRAM_ALLOWED_CHAT_IDS.length > 0;
  const hasSavedChats = state.snapshot.registeredChatIds.length > 0;

  if (!hasEnvAllowlist && !hasSavedChats) {
    state.registerChatId(id);
    await state.save();
    console.log(`[bot] linked your Telegram (chat ${id})`);
    return true;
  }

  await ctx.reply("This bot is private.");
  return false;
}
