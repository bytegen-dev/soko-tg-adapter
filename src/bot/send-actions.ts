import { InlineKeyboard, type Context } from "grammy";

import type { Config } from "../config.js";
import {
  roomDisplayName,
  SokosumiClient,
} from "../sokosumi/client.js";
import type { StateStore } from "../state.js";
import {
  clearComposeSession,
  setComposeSession,
} from "./compose-sessions.js";
import { E, withEmoji } from "./emoji.js";
import { roomIndexForId, sendReadView } from "./read-actions.js";

export function composeCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(
    withEmoji(E.back, "Cancel"),
    "compose:cancel",
  );
}

export async function deliverRoomMessage(
  client: SokosumiClient,
  state: StateStore,
  roomId: string,
  content: string,
): Promise<void> {
  const message = await client.sendMessage(roomId, content);
  state.setLastNotifiedMessageId(roomId, message.id);
  await state.save();
}

export async function startCompose(
  ctx: Context,
  client: SokosumiClient,
  state: StateStore,
  roomId: string,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  const rooms = await client.listRooms();
  state.setRoomOrder(rooms.map((room) => room.id));
  const room = rooms.find((entry) => entry.id === roomId);
  const title = room
    ? roomDisplayName(room, state.snapshot.selfUserId)
    : "chat";
  const roomIndex = roomIndexForId(state, roomId);

  setComposeSession(String(chatId), { roomId, title, roomIndex });
  await ctx.reply(
    withEmoji(E.reply, `Replying to ${title}. Type your message or /cancel.`),
    { reply_markup: composeCancelKeyboard() },
  );
}

export async function sendComposedMessage(
  ctx: Context,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  roomId: string,
  title: string,
  roomIndex: number | null,
  content: string,
): Promise<void> {
  await deliverRoomMessage(client, state, roomId, content);
  clearComposeSession(String(ctx.chat!.id));

  await ctx.reply(withEmoji(E.sent, `Sent to ${title}.`));

  try {
    await sendReadView(ctx, config, client, state, roomId, roomIndex);
  } catch (error) {
    console.error("[bot] refresh after send failed:", error);
  }
}

export async function cancelCompose(ctx: Context): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId || !clearComposeSession(String(chatId))) {
    return false;
  }
  await ctx.reply(withEmoji(E.back, "Reply cancelled."));
  return true;
}
