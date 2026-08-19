import {
  isChannelRoom,
  isCoworkerDirectRoom,
  type ChatRoom,
} from "../sokosumi/client.js";

/** One emoji per role — avoid stacking on the same line. */
export const E = {
  chats: "💬",
  settings: "⚙️",
  help: "❓",
  status: "📡",
  dm: "💬",
  channel: "📢",
  coworker: "🤖",
  muted: "🔇",
  unread: "📬",
  mention: "📣",
  older: "⬆️",
  open: "↗️",
  view: "👁",
  reply: "✏️",
  refresh: "🔄",
  back: "◀️",
  next: "▶️",
  mute: "🔕",
  unmute: "🔔",
  ok: "✅",
  loading: "⏳",
  sent: "✓",
  warn: "⚠️",
} as const;

export function withEmoji(emoji: string, text: string): string {
  return `${emoji} ${text}`;
}

export function roomEmoji(room: ChatRoom): string {
  if (isChannelRoom(room)) {
    return E.channel;
  }
  if (isCoworkerDirectRoom(room)) {
    return E.coworker;
  }
  return E.dm;
}

export function roomListPrefix(room: ChatRoom, muted: boolean): string {
  if (muted) {
    return E.muted;
  }
  return roomEmoji(room);
}
