import { InlineKeyboard } from "grammy";

import { roomDisplayName, type ChatRoom } from "../sokosumi/client.js";
import type { StateStore } from "../state.js";
import { E, withEmoji } from "./emoji.js";
import {
  sortRoomsForDisplay,
  ROOMS_PAGE_SIZE,
} from "./rooms-view.js";
import { describeQuietHours } from "./quiet-hours.js";
import { homeMenuRow } from "./menu-keyboard.js";

export function buildSettingsText(
  state: StateStore,
  rooms: ChatRoom[],
  pollIntervalMs: number,
  orgSlug: string,
): string {
  const mutedCount = state.snapshot.mutedRoomIds.length;
  const globalMute = state.snapshot.muteAll;

  const lines = [
    `<b>${E.settings} Settings</b>`,
    "",
    `Organization: ${orgSlug}`,
    `Poll interval: ${pollIntervalMs}ms`,
    `Global mute: ${globalMute ? `${E.muted} on` : `${E.unmute} off`}`,
    `Quiet hours: ${describeQuietHours(state.snapshot)}`,
    `Muted chats: ${mutedCount}`,
  ];

  if (mutedCount > 0 && !globalMute) {
    lines.push("", "<b>Muted</b>");
    for (const room of rooms) {
      if (state.snapshot.mutedRoomIds.includes(room.id)) {
        lines.push(`- ${roomDisplayName(room, state.snapshot.selfUserId)}`);
      }
    }
  }

  lines.push("", "Tap a button below to change alert settings.");
  return lines.join("\n");
}

export function settingsKeyboard(state: StateStore): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (state.snapshot.muteAll) {
    keyboard.text(withEmoji(E.unmute, "Unmute all"), "settings:unmuteall");
  } else {
    keyboard.text(withEmoji(E.mute, "Mute all"), "settings:muteall");
  }
  keyboard.row().text(withEmoji(E.refresh, "Refresh"), "settings:refresh");
  keyboard.row().text(withEmoji(E.mute, "Quiet hours"), "settings:quiet");
  keyboard.row().text(withEmoji(E.chats, "Manage chats"), "settings:chats:0");
  keyboard.row().text(withEmoji(E.help, "Help"), "settings:help");
  return homeMenuRow(keyboard);
}

const MANAGE_PAGE_SIZE = ROOMS_PAGE_SIZE;
const MAX_MUTE_LABEL = 34;

function muteActionLabel(
  room: ChatRoom,
  state: StateStore,
  selfUserId: string | undefined,
  mute: boolean,
): string {
  const name = roomDisplayName(room, selfUserId);
  let label = mute
    ? withEmoji(E.mute, name)
    : withEmoji(E.unmute, name);
  if (label.length > MAX_MUTE_LABEL) {
    label = `${label.slice(0, MAX_MUTE_LABEL - 1)}…`;
  }
  return label;
}

export function manageChatsText(
  rooms: ChatRoom[],
  state: StateStore,
  page: number,
): string {
  if (state.snapshot.muteAll) {
    return [
      `<b>${E.mute} Alert settings</b>`,
      "",
      `${E.muted} Global mute is on. No alerts are sent.`,
      "Use Unmute all in Settings to resume.",
    ].join("\n");
  }

  const sorted = sortRoomsForDisplay(rooms);
  const totalPages = Math.ceil(sorted.length / MANAGE_PAGE_SIZE);
  const lines = [`<b>${E.mute} Alert settings</b>`];

  if (totalPages > 1) {
    lines.push(`Page ${page + 1} of ${totalPages}`);
  }

  lines.push("", "Tap to mute or unmute a chat.");
  return lines.join("\n");
}

export function manageChatsKeyboard(
  rooms: ChatRoom[],
  state: StateStore,
  page: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (state.snapshot.muteAll) {
    keyboard.text(withEmoji(E.back, "Back to settings"), "settings:refresh");
    return keyboard;
  }

  const sorted = sortRoomsForDisplay(rooms);
  const start = page * MANAGE_PAGE_SIZE;
  const slice = sorted.slice(start, start + MANAGE_PAGE_SIZE);
  const selfUserId = state.snapshot.selfUserId;

  for (const room of slice) {
    const muted = state.isRoomMuted(room.id);
    const label = muteActionLabel(room, state, selfUserId, !muted);
    const action = muted ? "settings:unmute:oid" : "settings:mute:oid";
    keyboard.text(label, `${action}:${room.id}`).row();
  }

  const totalPages = Math.ceil(sorted.length / MANAGE_PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text(withEmoji(E.back, "Previous"), `settings:chats:${page - 1}`);
    }
    if (page < totalPages - 1) {
      keyboard.text(withEmoji(E.next, "Next"), `settings:chats:${page + 1}`);
    }
    keyboard.row();
  }

  keyboard.text(withEmoji(E.back, "Back to settings"), "settings:refresh");
  return keyboard;
}
