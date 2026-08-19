import { Keyboard } from "grammy";

export const MENU_LABELS = {
  chats: "Chats",
  settings: "Settings",
  help: "Help",
  status: "Status",
} as const;

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
