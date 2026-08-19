import { E, withEmoji } from "./emoji.js";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const HELP_TEXT = [
  `${E.chats} Sokosumi Telegram adapter`,
  "",
  `${E.chats} Chats`,
  "/rooms - list DMs and channels",
  "/read <n> - open a chat",
  "/send <n> <text> - send a reply",
  "",
  `${E.mute} Alerts`,
  "/settings - mute chats or mute all",
  "/mute <n> - stop alerts for one chat",
  "/unmute <n> - resume alerts for one chat",
  "/muteall - stop all alerts",
  "/unmuteall - resume all alerts",
  "",
  `${E.status} Other`,
  "/status - connection and poll info",
  "/help - this message",
].join("\n");

export const START_TEXT = [
  `${E.ok} Connected to Sokosumi.`,
  "",
  "Direct messages and channel posts show up here within a few seconds.",
  "Use the buttons below to get started.",
].join("\n");

export const LOADING_CHATS = withEmoji(E.loading, "Loading chats...");
export const LOADING_SETTINGS = withEmoji(E.loading, "Loading settings...");
export const ERROR_LOAD_CHATS = withEmoji(
  E.warn,
  "Could not load chats. Check API key and org slug.",
);
export const ERROR_LOAD_SETTINGS = withEmoji(E.warn, "Could not load settings.");
export const ERROR_GENERIC = withEmoji(E.warn, "Something went wrong. Try again.");
