import { InlineKeyboard, type Context } from "grammy";

import { E, withEmoji } from "./emoji.js";

export const MENU_BASE = {
  chats: "Chats",
  settings: "Settings",
  help: "Help",
  status: "Status",
} as const;

export type MenuKey = keyof typeof MENU_BASE;

export const MENU_LABELS: Record<MenuKey, string> = {
  chats: withEmoji(E.chats, MENU_BASE.chats),
  settings: withEmoji(E.settings, MENU_BASE.settings),
  help: withEmoji(E.help, MENU_BASE.help),
  status: withEmoji(E.status, MENU_BASE.status),
};

/** Legacy reply-keyboard labels (still accepted as plain text). */
export const MENU_TRIGGERS = new Set<string>([
  ...Object.values(MENU_LABELS),
  ...Object.values(MENU_BASE),
]);

export function matchMenuKey(text: string): MenuKey | null {
  const trimmed = text.trim();
  for (const key of Object.keys(MENU_BASE) as MenuKey[]) {
    if (trimmed === MENU_LABELS[key] || trimmed === MENU_BASE[key]) {
      return key;
    }
  }
  return null;
}

export function mainMenuInline(): InlineKeyboard {
  return new InlineKeyboard()
    .text(MENU_LABELS.chats, "menu:chats")
    .row()
    .text(MENU_LABELS.settings, "menu:settings")
    .text(MENU_LABELS.help, "menu:help")
    .row()
    .text(MENU_LABELS.status, "menu:status");
}

/** Drop the old persistent reply keyboard after switching to inline menus. */
export async function clearReplyKeyboard(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }
  try {
    const note = await ctx.api.sendMessage(chatId, ".", {
      reply_markup: { remove_keyboard: true },
    });
    await ctx.api.deleteMessage(chatId, note.message_id);
  } catch {
    // Non-fatal if Telegram rejects the cleanup message.
  }
}

export function homeMenuRow(keyboard: InlineKeyboard): InlineKeyboard {
  return keyboard.row().text(withEmoji(E.back, "Home"), "menu:home");
}
