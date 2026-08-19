export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const HELP_TEXT = [
  "Sokosumi Telegram adapter",
  "",
  "Chats",
  "/rooms - list DMs and channels",
  "/read <n> - open a chat",
  "/send <n> <text> - send a reply",
  "",
  "Alerts",
  "/settings - mute chats or mute all",
  "/mute <n> - stop alerts for one chat",
  "/unmute <n> - resume alerts for one chat",
  "/muteall - stop all alerts",
  "/unmuteall - resume all alerts",
  "",
  "Other",
  "/status - connection and poll info",
  "/help - this message",
].join("\n");

export const START_TEXT = [
  "You are connected to Sokosumi.",
  "",
  "Direct messages and channel posts show up here within a few seconds.",
  "Use the buttons below to get started.",
].join("\n");
