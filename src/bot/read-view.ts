import { InlineKeyboard } from "grammy";

import type { Config } from "../config.js";
import {
  messageSenderName,
  truncate,
  type ChatRoomMessage,
} from "../sokosumi/client.js";
import { buildChatRoomUrl } from "../sokosumi/links.js";
import type { StateStore } from "../state.js";
import { escapeHtml } from "./text.js";

export const READ_PAGE_SIZE = 12;

export interface ReadViewPage {
  roomId: string;
  roomIndex: number | null;
  title: string;
  messages: ChatRoomMessage[];
  nextCursor: string | null;
  sessionId?: string;
}

export function formatReadBody(messages: ChatRoomMessage[]): string {
  if (messages.length === 0) {
    return "<i>No messages in this view.</i>";
  }

  return messages
    .map((message) => {
      const sender = messageSenderName(message);
      const text = message.deletedAt
        ? "[deleted]"
        : truncate(message.content, 420);
      return `<b>${escapeHtml(sender)}</b>: ${escapeHtml(text)}`;
    })
    .join("\n\n");
}

export function buildReadText(page: ReadViewPage): string {
  const header = `<b>${escapeHtml(page.title)}</b>`;
  const footer =
    page.nextCursor === null
      ? "\n\n<i>Start of history</i>"
      : "\n\n<i>Tap Older for earlier messages</i>";
  return `${header}\n\n${formatReadBody(page.messages)}${footer}`;
}

export function readKeyboard(
  config: Config,
  state: StateStore,
  page: ReadViewPage,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (page.nextCursor && page.sessionId) {
    keyboard.text("Older messages", `read:old:${page.sessionId}`);
  }
  keyboard.row().url("Open in Sokosumi", buildChatRoomUrl(config, page.roomId));

  const muted = state.isRoomMuted(page.roomId);
  if (page.roomIndex !== null) {
    if (muted) {
      keyboard.text("Unmute chat", `unmute:${page.roomIndex}`);
    } else {
      keyboard.text("Mute chat", `mute:${page.roomIndex}`);
    }
  } else if (muted) {
    keyboard.text("Unmute chat", `unmute:oid:${page.roomId}`);
  } else {
    keyboard.text("Mute chat", `mute:oid:${page.roomId}`);
  }
  return keyboard;
}
