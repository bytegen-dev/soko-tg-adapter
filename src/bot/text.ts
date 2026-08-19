import { E, withEmoji } from "./emoji.js";
import { describeQuietHours } from "./quiet-hours.js";
import type { Config } from "../config.js";
import type { StateStore } from "../state.js";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Plain text safe for Telegram HTML (avoids hashtag and broken mention autolink). */
export function escapeTelegramPlain(value: string): string {
  return escapeHtml(value).replace(/#/g, "&#35;");
}

export const HELP_TEXT = [
  `${E.chats} Sokosumi Telegram adapter`,
  "",
  `${E.chats} Chats`,
  "/rooms - list DMs and channels",
  "/read <n> - open a chat",
  "Reply button - type your message to send",
  "/send <n> <text> - send without opening chat",
  "/cancel - stop replying",
  "",
  `${E.mute} Alerts`,
  "/settings - mute chats or mute all",
  "/mute <n> - stop alerts for one chat",
  "/unmute <n> - resume alerts for one chat",
  "/muteall - stop all alerts",
  "/unmuteall - resume all alerts",
  "",
  `${E.status} Quiet hours`,
  "Settings - Quiet hours - pause alerts on a daily schedule",
  "",
  `${E.status} Other`,
  "/status - connection and poll info",
  "/help - this message",
].join("\n");

export function buildStatusText(config: Config, state: StateStore): string {
  const muted = state.snapshot.muteAll
    ? `${E.muted} all muted`
    : state.snapshot.mutedRoomIds.length > 0
      ? `${E.muted} ${state.snapshot.mutedRoomIds.length} chat(s) muted`
      : `${E.unmute} alerts on`;
  return [
    `${E.status} Status`,
    "",
    `Organization: ${config.SOKOSUMI_ORG_SLUG}`,
    `Poll interval: ${config.POLL_INTERVAL_MS}ms`,
    `Alerts: ${muted}`,
    `Quiet hours: ${describeQuietHours(state.snapshot)}`,
  ].join("\n");
}

export interface SokosumiUserSummary {
  name: string;
  email: string;
}

export function buildStartText(user?: SokosumiUserSummary): string {
  const lines = [`${E.unread} Sokosumi alerts`, ""];
  if (user) {
    lines.push(`Connected as ${user.name} (${user.email})`, "");
  }
  lines.push(
    "New DMs and channel posts show up here within a few seconds.",
    "Use the buttons on this message to browse chats or change settings.",
  );
  return lines.join("\n");
}

export const LOADING_CHATS = withEmoji(E.loading, "Loading chats...");
export const LOADING_SETTINGS = withEmoji(E.loading, "Loading settings...");
export const ERROR_LOAD_CHATS = withEmoji(
  E.warn,
  "Could not load chats. Check API key and org slug.",
);
export const ERROR_LOAD_SETTINGS = withEmoji(E.warn, "Could not load settings.");
export const ERROR_GENERIC = withEmoji(E.warn, "Something went wrong. Try again.");
