import type { Context } from "grammy";

import type { Config } from "../config.js";
import {
  roomDisplayName,
  SokosumiClient,
  type ChatRoom,
  type ChatRoomMessage,
} from "../sokosumi/client.js";
import {
  buildReadText,
  READ_PAGE_SIZE,
  readKeyboard,
  type ReadViewPage,
} from "./read-view.js";
import {
  createReadSession,
  getReadSession,
  updateReadSession,
} from "./read-sessions.js";
import type { StateStore } from "../state.js";
import { escapeHtml } from "./text.js";

export function roomIndexForId(state: StateStore, roomId: string): number | null {
  const index = state.snapshot.roomOrder.indexOf(roomId);
  return index >= 0 ? index + 1 : null;
}

export async function loadReadPage(
  client: SokosumiClient,
  roomId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ messages: ChatRoomMessage[]; nextCursor: string | null }> {
  return client.listRoomMessages(roomId, {
    limit: options?.limit ?? READ_PAGE_SIZE,
    cursor: options?.cursor,
  });
}

export async function sendReadView(
  ctx: Context,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  roomId: string,
  roomIndex: number | null,
  options?: { editMessageId?: number },
): Promise<void> {
  const rooms = await client.listRooms();
  const room = rooms.find((entry) => entry.id === roomId);
  const title = room
    ? roomDisplayName(room, state.snapshot.selfUserId)
    : "Direct message";

  const { messages, nextCursor } = await loadReadPage(client, roomId);
  if (messages.length === 0) {
    const text = `<b>${escapeHtml(title)}</b>\n\nNo messages yet.`;
    if (options?.editMessageId) {
      await ctx.editMessageText(text, { parse_mode: "HTML" });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
    return;
  }

  const page: ReadViewPage = {
    roomId,
    roomIndex,
    title,
    messages,
    nextCursor,
  };

  const sessionId = createReadSession({
    roomId,
    roomIndex,
    title,
    messages,
    nextCursor,
  });
  page.sessionId = sessionId;

  const text = buildReadText(page);
  const markup = readKeyboard(config, state, page);

  if (options?.editMessageId) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: markup,
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: markup,
    });
  }
}

export async function appendOlderReadPage(
  ctx: Context,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  sessionId: string,
): Promise<boolean> {
  const session = getReadSession(sessionId);
  if (!session?.nextCursor) {
    return false;
  }

  const { messages: older, nextCursor } = await loadReadPage(
    client,
    session.roomId,
    { cursor: session.nextCursor },
  );

  if (older.length === 0) {
    session.nextCursor = null;
    updateReadSession(sessionId, session);
    return false;
  }

  session.messages = [...older, ...session.messages];
  session.nextCursor = nextCursor;
  updateReadSession(sessionId, session);

  const page: ReadViewPage = {
    roomId: session.roomId,
    roomIndex: session.roomIndex,
    title: session.title,
    messages: session.messages,
    nextCursor: session.nextCursor,
    sessionId,
  };

  let text = buildReadText(page);
  if (text.length > 4000) {
    while (text.length > 4000 && page.messages.length > READ_PAGE_SIZE) {
      page.messages = page.messages.slice(1);
      text = buildReadText(page);
    }
    session.messages = page.messages;
    updateReadSession(sessionId, session);
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: readKeyboard(config, state, page),
  });
  return true;
}

export function findRoomByIndex(
  rooms: ChatRoom[],
  index: number,
): ChatRoom | undefined {
  return rooms[index - 1];
}

function latestMessageId(messages: ChatRoomMessage[]): string | undefined {
  if (messages.length === 0) {
    return undefined;
  }
  const sorted = [...messages].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id.localeCompare(b.id);
  });
  return sorted.at(-1)?.id;
}

export async function markRoomAsRead(
  client: SokosumiClient,
  state: StateStore,
  roomId: string,
  knownLatestMessageId?: string,
): Promise<void> {
  await client.markRoomRead(roomId);

  if (knownLatestMessageId) {
    state.setLastNotifiedMessageId(roomId, knownLatestMessageId);
  } else {
    const { messages } = await client.listRoomMessages(roomId, { limit: 20 });
    const latestId = latestMessageId(messages);
    if (latestId) {
      state.setLastNotifiedMessageId(roomId, latestId);
    }
  }

  await state.save();
}
