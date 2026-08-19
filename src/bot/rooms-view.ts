import { InlineKeyboard } from "grammy";

import { roomDisplayName, type ChatRoom } from "../sokosumi/client.js";
import type { StateStore } from "../state.js";
import { E, roomListPrefix, withEmoji } from "./emoji.js";

export const ROOMS_PAGE_SIZE = 6;
const MAX_BUTTON_LABEL = 36;

export function sortRoomsForDisplay(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    if (a.unreadMentionCount !== b.unreadMentionCount) {
      return b.unreadMentionCount - a.unreadMentionCount;
    }
    if (a.unreadCount !== b.unreadCount) {
      return b.unreadCount - a.unreadCount;
    }
    const aName = roomDisplayName(a).toLowerCase();
    const bName = roomDisplayName(b).toLowerCase();
    return aName.localeCompare(bName);
  });
}

export function roomButtonLabel(
  room: ChatRoom,
  state: StateStore,
  selfUserId: string | undefined,
): string {
  const name = roomDisplayName(room, selfUserId);
  const prefix = roomListPrefix(room, state.isRoomMuted(room.id));
  let label = `${prefix} ${name}`;

  if (room.unreadCount > 0) {
    label = `${label} (${room.unreadCount})`;
  }
  if (room.unreadMentionCount > 0) {
    label = `${label} ${E.mention}${room.unreadMentionCount}`;
  }
  if (label.length > MAX_BUTTON_LABEL) {
    return `${label.slice(0, MAX_BUTTON_LABEL - 1)}…`;
  }
  return label;
}

export function buildRoomsText(rooms: ChatRoom[], page = 0): string {
  if (rooms.length === 0) {
    return `${E.chats} No chats yet. Direct messages and channels will show up here.`;
  }

  const totalPages = Math.ceil(rooms.length / ROOMS_PAGE_SIZE);
  const unreadTotal = rooms.reduce((sum, room) => sum + room.unreadCount, 0);
  const mentionTotal = rooms.reduce(
    (sum, room) => sum + room.unreadMentionCount,
    0,
  );
  const lines = [`<b>${E.chats} Chats</b>`];

  const stats: string[] = [];
  if (unreadTotal > 0) {
    stats.push(`${E.unread} ${unreadTotal} unread`);
  }
  if (mentionTotal > 0) {
    stats.push(`${E.mention} ${mentionTotal} mention${mentionTotal === 1 ? "" : "s"}`);
  }
  if (stats.length > 0) {
    lines.push(stats.join(" · "));
  }

  if (totalPages > 1) {
    lines.push(`Page ${page + 1} of ${totalPages}`);
  }

  lines.push("", "Tap a name to open.");
  return lines.join("\n");
}

export function roomsKeyboard(
  rooms: ChatRoom[],
  state: StateStore,
  selfUserId: string | undefined,
  page = 0,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const sorted = sortRoomsForDisplay(rooms);
  const start = page * ROOMS_PAGE_SIZE;
  const slice = sorted.slice(start, start + ROOMS_PAGE_SIZE);

  for (const room of slice) {
    keyboard
      .text(roomButtonLabel(room, state, selfUserId), `read:oid:${room.id}`)
      .row();
  }

  const totalPages = Math.ceil(sorted.length / ROOMS_PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text(withEmoji(E.back, "Previous"), `rooms:page:${page - 1}`);
    }
    if (page < totalPages - 1) {
      keyboard.text(withEmoji(E.next, "Next"), `rooms:page:${page + 1}`);
    }
    keyboard.row();
  }

  keyboard
    .text(withEmoji(E.refresh, "Refresh"), "rooms:page:0")
    .text(withEmoji(E.settings, "Settings"), "settings:refresh");
  return keyboard;
}
