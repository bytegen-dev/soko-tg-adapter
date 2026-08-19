import { Keyboard } from "grammy";

import { E, withEmoji } from "./emoji.js";

export const MENU_BASE = {
  chats: "Chats",
  settings: "Settings",
  help: "Help",
  status: "Status",
} as const;

export type MenuKey = keyof typeof MENU_BASE;

/** Button labels shown on the reply keyboard. */
export const MENU_LABELS: Record<MenuKey, string> = {
  chats: withEmoji(E.chats, MENU_BASE.chats),
  settings: withEmoji(E.settings, MENU_BASE.settings),
  help: withEmoji(E.help, MENU_BASE.help),
  status: withEmoji(E.status, MENU_BASE.status),
};

/** All strings that should trigger a menu action (emoji + legacy plain labels). */
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

export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU_LABELS.chats)
    .row()
    .text(MENU_LABELS.settings)
    .text(MENU_LABELS.help)
    .row()
    .text(MENU_LABELS.status)
    .resized()
    .persistent();
}
