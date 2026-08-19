import { InlineKeyboard } from "grammy";

import type { Config } from "../config.js";
import {
  messageSenderName,
  type ChatRoomMessage,
} from "../sokosumi/client.js";
import { buildChatRoomUrl } from "../sokosumi/links.js";
import type { StateStore } from "../state.js";
import { E, withEmoji } from "./emoji.js";
import { escapeHtml, escapeTelegramPlain } from "./text.js";
import { formatMessageHtml } from "./markup.js";

export const READ_PAGE_SIZE = 12;

export interface ReadViewPage {
  roomId: string;
  roomIndex: number | null;
  title: string;
  messages: ChatRoomMessage[];
  nextCursor: string | null;
  sessionId?: string;
  hasUnread: boolean;
}

export function formatReadBody(messages: ChatRoomMessage[]): string {
  if (messages.length === 0) {
    return "<i>No messages in this view.</i>";
  }

  return messages
    .map((message) => {
      const sender = messageSenderName(message);
      const body = message.deletedAt
        ? escapeHtml("[deleted]")
        : formatMessageHtml(message.content, 420);
      return `<b>${escapeTelegramPlain(sender)}</b>: ${body}`;
    })
    .join("\n\n");
}

export function buildReadText(page: ReadViewPage): string {
  const header = `<b>${escapeTelegramPlain(page.title)}</b>`;
  const footer =
    page.nextCursor === null
      ? "\n\n<i>Start of history</i>"
      : "\n\n<i>Tap Older for earlier messages</i>";
  return `${header}\n\n${formatReadBody(page.messages)}${footer}`;
}

export function alertKeyboard(
  config: Config,
  state: StateStore,
  roomId: string,
  hasUnread: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  keyboard
    .text(withEmoji(E.view, "View"), `read:oid:${roomId}`)
    .text(withEmoji(E.reply, "Reply"), `compose:oid:${roomId}`);
  if (hasUnread) {
    keyboard
      .row()
      .text(withEmoji(E.readDone, "Mark read"), `read:mark:oid:${roomId}`);
  }
  keyboard.row().url(withEmoji(E.open, "Open"), buildChatRoomUrl(config, roomId));
  if (!state.isRoomMuted(roomId)) {
    keyboard.row().text(withEmoji(E.mute, "Mute"), `mute:oid:${roomId}`);
  }
  return keyboard;
}

export function readKeyboard(
  config: Config,
  state: StateStore,
  page: ReadViewPage,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  keyboard.row().text(withEmoji(E.back, "Chats"), "menu:chats");
  if (page.nextCursor && page.sessionId) {
    keyboard.text(withEmoji(E.older, "Older"), `read:old:${page.sessionId}`);
  }
  keyboard.row().text(withEmoji(E.reply, "Reply"), `compose:oid:${page.roomId}`);
  if (page.hasUnread) {
    keyboard.text(withEmoji(E.readDone, "Mark read"), `read:mark:oid:${page.roomId}`);
  }
  keyboard.row().url(withEmoji(E.open, "Open"), buildChatRoomUrl(config, page.roomId));

  const muted = state.isRoomMuted(page.roomId);
  if (page.roomIndex !== null) {
    if (muted) {
      keyboard.text(withEmoji(E.unmute, "Unmute"), `unmute:${page.roomIndex}`);
    } else {
      keyboard.text(withEmoji(E.mute, "Mute"), `mute:${page.roomIndex}`);
    }
  } else if (muted) {
    keyboard.text(withEmoji(E.unmute, "Unmute"), `unmute:oid:${page.roomId}`);
  } else {
    keyboard.text(withEmoji(E.mute, "Mute"), `mute:oid:${page.roomId}`);
  }
  return keyboard;
}
