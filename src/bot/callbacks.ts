import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";

import { ensureAllowed } from "./access.js";
import { safeAnswerCallback } from "./callback-utils.js";
import {
  appendOlderReadPage,
  findRoomByIndex,
  markRoomAsRead,
  roomIndexForId,
  sendReadView,
} from "./read-actions.js";
import { startCompose } from "./send-actions.js";
import { readKeyboard, type ReadViewPage } from "./read-view.js";
import { getReadSession } from "./read-sessions.js";
import { clearComposeSession } from "./compose-sessions.js";
import {
  buildSettingsText,
  manageChatsKeyboard,
  manageChatsText,
  settingsKeyboard,
} from "./settings-view.js";
import {
  buildQuietHoursText,
  pickQuietEndText,
  pickQuietEndKeyboard,
  pickQuietStartText,
  pickQuietStartKeyboard,
  pickQuietTimezoneText,
  pickQuietTimezoneKeyboard,
  quietHoursKeyboard,
} from "./quiet-hours-view.js";
import {
  fromClockToken,
  timezoneOptionById,
} from "./quiet-hours.js";
import { buildRoomsText, roomsKeyboard, sortRoomsForDisplay, ROOMS_PAGE_SIZE } from "./rooms-view.js";
import {
  editMessageToHelp,
  editMessageToRooms,
  editMessageToSettings,
  editMessageToStart,
  editMessageToStatus,
} from "./menu-actions.js";
import { E, withEmoji } from "./emoji.js";
import type { Config } from "../config.js";
import { SokosumiClient, type ChatRoom } from "../sokosumi/client.js";
import type { StateStore } from "../state.js";

async function refreshSettings(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  chatId: number,
  messageId: number,
): Promise<void> {
  const rooms = await client.listRooms();
  state.setRoomOrder(rooms.map((room) => room.id));
  await state.save();

  await bot.api.editMessageText(
    chatId,
    messageId,
    buildSettingsText(
      state,
      rooms,
      config.POLL_INTERVAL_MS,
      config.SOKOSUMI_ORG_SLUG,
    ),
    {
      parse_mode: "HTML",
      reply_markup: settingsKeyboard(state),
    },
  );
}

async function refreshReadMuteButton(
  ctx: Context,
  config: Config,
  state: StateStore,
  roomId: string,
  roomIndex: number,
): Promise<void> {
  const message = ctx.callbackQuery?.message;
  if (!message || !("reply_markup" in message) || !message.reply_markup) {
    return;
  }

  let sessionId: string | undefined;
  for (const row of message.reply_markup.inline_keyboard) {
    for (const button of row) {
      if (
        "callback_data" in button &&
        button.callback_data?.startsWith("read:old:")
      ) {
        sessionId = button.callback_data.slice("read:old:".length);
        break;
      }
    }
  }

  if (!sessionId) {
    return;
  }

  const session = getReadSession(sessionId);
  if (!session || session.roomId !== roomId) {
    return;
  }

  const page: ReadViewPage = {
    roomId: session.roomId,
    roomIndex: session.roomIndex ?? roomIndex,
    title: session.title,
    messages: session.messages,
    nextCursor: session.nextCursor,
    sessionId,
  };

  await ctx.editMessageReplyMarkup({
    reply_markup: readKeyboard(config, state, page),
  });
}

function managePageForRoom(rooms: ChatRoom[], roomId: string): number {
  const sorted = sortRoomsForDisplay(rooms);
  const index = sorted.findIndex((room) => room.id === roomId);
  if (index < 0) {
    return 0;
  }
  return Math.floor(index / ROOMS_PAGE_SIZE);
}

async function refreshManageChats(
  bot: Bot,
  rooms: ChatRoom[],
  state: StateStore,
  chatId: number,
  messageId: number,
  page: number,
): Promise<void> {
  await bot.api.editMessageText(
    chatId,
    messageId,
    manageChatsText(rooms, state, page),
    {
      parse_mode: "HTML",
      reply_markup: manageChatsKeyboard(rooms, state, page),
    },
  );
}

async function refreshQuietHours(
  bot: Bot,
  state: StateStore,
  chatId: number,
  messageId: number,
): Promise<void> {
  await bot.api.editMessageText(
    chatId,
    messageId,
    buildQuietHoursText(state),
    {
      parse_mode: "HTML",
      reply_markup: quietHoursKeyboard(state),
    },
  );
}

export function registerCallbacks(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
): void {
  bot.on("callback_query:data", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      await ctx.answerCallbackQuery({ text: "Not allowed." });
      return;
    }

    const data = ctx.callbackQuery.data;

    try {
      if (data.startsWith("menu:")) {
        const message = ctx.callbackQuery.message;
        if (!message) {
          await safeAnswerCallback(ctx);
          return;
        }
        const chatId = message.chat.id;
        const messageId = message.message_id;
        await safeAnswerCallback(ctx);

        switch (data) {
          case "menu:home":
            await editMessageToStart(bot, client, chatId, messageId);
            break;
          case "menu:chats":
            await editMessageToRooms(bot, client, state, chatId, messageId);
            break;
          case "menu:settings":
            await editMessageToSettings(
              bot,
              config,
              client,
              state,
              chatId,
              messageId,
            );
            break;
          case "menu:help":
            await editMessageToHelp(bot, chatId, messageId);
            break;
          case "menu:status":
            await editMessageToStatus(bot, config, state, chatId, messageId);
            break;
        }
        return;
      }

      if (data.startsWith("read:open:")) {
        const index = Number.parseInt(data.slice("read:open:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        await state.save();
        const room = findRoomByIndex(rooms, index);
        if (!room) {
          await ctx.answerCallbackQuery({ text: "Chat not found. Run /rooms." });
          return;
        }
        await ctx.answerCallbackQuery();
        await sendReadView(ctx, config, client, state, room.id, index);
        return;
      }

      if (data.startsWith("read:mark:oid:")) {
        const roomId = data.slice("read:mark:oid:".length);
        const message = ctx.callbackQuery.message;
        let knownLatestMessageId: string | undefined;

        if (message && "reply_markup" in message && message.reply_markup) {
          for (const row of message.reply_markup.inline_keyboard) {
            for (const button of row) {
              if (
                "callback_data" in button &&
                button.callback_data?.startsWith("read:old:")
              ) {
                const session = getReadSession(
                  button.callback_data.slice("read:old:".length),
                );
                if (session?.roomId === roomId) {
                  knownLatestMessageId = session.messages.at(-1)?.id;
                }
              }
            }
          }
        }

        try {
          await markRoomAsRead(client, state, roomId, knownLatestMessageId);
          await safeAnswerCallback(ctx, { text: "Marked as read" });

          const keyboard = message?.reply_markup?.inline_keyboard ?? [];
          let hasViewButton = false;
          let hasMarkReadButton = false;
          for (const row of keyboard) {
            for (const button of row) {
              if (!("callback_data" in button)) {
                continue;
              }
              if (button.callback_data?.startsWith("read:oid:")) {
                hasViewButton = true;
              }
              if (button.callback_data?.startsWith("read:mark:oid:")) {
                hasMarkReadButton = true;
              }
            }
          }

          if (hasMarkReadButton && !hasViewButton && message) {
            const index = roomIndexForId(state, roomId);
            await sendReadView(ctx, config, client, state, roomId, index, {
              editMessageId: message.message_id,
            });
          }
        } catch (error) {
          console.error("[bot] mark read failed:", error);
          await safeAnswerCallback(ctx, { text: "Could not mark as read" });
        }
        return;
      }

      if (data.startsWith("read:oid:")) {
        const roomId = data.slice("read:oid:".length);
        const index = roomIndexForId(state, roomId);
        await ctx.answerCallbackQuery();
        await sendReadView(ctx, config, client, state, roomId, index);
        return;
      }

      if (data === "settings:quiet") {
        if (!ctx.callbackQuery.message) {
          await safeAnswerCallback(ctx);
          return;
        }
        await safeAnswerCallback(ctx);
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          buildQuietHoursText(state),
          {
            parse_mode: "HTML",
            reply_markup: quietHoursKeyboard(state),
          },
        );
        return;
      }

      if (data === "quiet:on") {
        state.setQuietHoursEnabled(true);
        await state.save();
        await safeAnswerCallback(ctx, { text: "Quiet hours on" });
        if (ctx.callbackQuery.message) {
          await refreshQuietHours(
            bot,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data === "quiet:off") {
        state.setQuietHoursEnabled(false);
        await state.save();
        await safeAnswerCallback(ctx, { text: "Quiet hours off" });
        if (ctx.callbackQuery.message) {
          await refreshQuietHours(
            bot,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data === "quiet:pick:start") {
        if (!ctx.callbackQuery.message) {
          await safeAnswerCallback(ctx);
          return;
        }
        await safeAnswerCallback(ctx);
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          pickQuietStartText(state),
          {
            parse_mode: "HTML",
            reply_markup: pickQuietStartKeyboard(),
          },
        );
        return;
      }

      if (data === "quiet:pick:end") {
        if (!ctx.callbackQuery.message) {
          await safeAnswerCallback(ctx);
          return;
        }
        await safeAnswerCallback(ctx);
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          pickQuietEndText(state),
          {
            parse_mode: "HTML",
            reply_markup: pickQuietEndKeyboard(),
          },
        );
        return;
      }

      if (data === "quiet:pick:tz") {
        if (!ctx.callbackQuery.message) {
          await safeAnswerCallback(ctx);
          return;
        }
        await safeAnswerCallback(ctx);
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          pickQuietTimezoneText(state),
          {
            parse_mode: "HTML",
            reply_markup: pickQuietTimezoneKeyboard(),
          },
        );
        return;
      }

      if (data.startsWith("quiet:ps:")) {
        const token = data.slice("quiet:ps:".length);
        const time = fromClockToken(token);
        if (!time) {
          await safeAnswerCallback(ctx, { text: "Invalid time" });
          return;
        }
        state.setQuietHoursStart(time);
        await state.save();
        await safeAnswerCallback(ctx, { text: "Quiet from updated" });
        if (ctx.callbackQuery.message) {
          await refreshQuietHours(
            bot,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data.startsWith("quiet:pe:")) {
        const token = data.slice("quiet:pe:".length);
        const time = fromClockToken(token);
        if (!time) {
          await safeAnswerCallback(ctx, { text: "Invalid time" });
          return;
        }
        state.setQuietHoursEnd(time);
        await state.save();
        await safeAnswerCallback(ctx, { text: "Quiet until updated" });
        if (ctx.callbackQuery.message) {
          await refreshQuietHours(
            bot,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data.startsWith("quiet:tz:")) {
        const id = Number.parseInt(data.slice("quiet:tz:".length), 10);
        const option = timezoneOptionById(id);
        if (!option) {
          await safeAnswerCallback(ctx, { text: "Unknown timezone" });
          return;
        }
        state.setQuietHoursTimezone(option.iana);
        await state.save();
        await safeAnswerCallback(ctx, { text: `Timezone: ${option.label}` });
        if (ctx.callbackQuery.message) {
          await refreshQuietHours(
            bot,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data.startsWith("compose:oid:")) {
        const roomId = data.slice("compose:oid:".length);
        await safeAnswerCallback(ctx);
        await startCompose(ctx, client, state, roomId);
        return;
      }

      if (data === "compose:cancel") {
        const chatId = ctx.chat?.id;
        const cleared = chatId ? clearComposeSession(String(chatId)) : false;
        await safeAnswerCallback(ctx, { text: cleared ? "Cancelled" : "OK" });
        if (cleared) {
          await ctx.reply(withEmoji(E.back, "Reply cancelled."));
        }
        return;
      }

      if (data.startsWith("read:old:")) {
        const sessionId = data.slice("read:old:".length);
        await safeAnswerCallback(ctx, { text: "Loading..." });
        try {
          await appendOlderReadPage(
            ctx,
            config,
            client,
            state,
            sessionId,
          );
        } catch (error) {
          console.error("[bot] read older failed:", sessionId, error);
        }
        return;
      }

      if (data.startsWith("mute:oid:")) {
        const roomId = data.slice("mute:oid:".length);
        state.muteRoom(roomId);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat muted" });
        return;
      }

      if (data.startsWith("unmute:oid:")) {
        const roomId = data.slice("unmute:oid:".length);
        state.unmuteRoom(roomId);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat unmuted" });
        return;
      }

      if (data.startsWith("settings:mute:oid:")) {
        const roomId = data.slice("settings:mute:oid:".length);
        state.muteRoom(roomId);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat muted" });
        if (ctx.callbackQuery.message) {
          const rooms = await client.listRooms();
          state.setRoomOrder(rooms.map((room) => room.id));
          await state.save();
          const page = managePageForRoom(rooms, roomId);
          await refreshManageChats(
            bot,
            rooms,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
            page,
          );
        }
        return;
      }

      if (data.startsWith("settings:unmute:oid:")) {
        const roomId = data.slice("settings:unmute:oid:".length);
        state.unmuteRoom(roomId);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat unmuted" });
        if (ctx.callbackQuery.message) {
          const rooms = await client.listRooms();
          state.setRoomOrder(rooms.map((room) => room.id));
          await state.save();
          const page = managePageForRoom(rooms, roomId);
          await refreshManageChats(
            bot,
            rooms,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
            page,
          );
        }
        return;
      }

      if (data.startsWith("settings:mute:")) {
        const index = Number.parseInt(data.slice("settings:mute:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        const room = findRoomByIndex(rooms, index);
        if (!room) {
          await ctx.answerCallbackQuery({ text: "Chat not found." });
          return;
        }
        state.muteRoom(room.id);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat muted" });
        if (ctx.callbackQuery.message) {
          const page = managePageForRoom(rooms, room.id);
          await refreshManageChats(
            bot,
            rooms,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
            page,
          );
        }
        return;
      }

      if (data.startsWith("settings:unmute:")) {
        const index = Number.parseInt(data.slice("settings:unmute:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        const room = findRoomByIndex(rooms, index);
        if (!room) {
          await ctx.answerCallbackQuery({ text: "Chat not found." });
          return;
        }
        state.unmuteRoom(room.id);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat unmuted" });
        if (ctx.callbackQuery.message) {
          const page = managePageForRoom(rooms, room.id);
          await refreshManageChats(
            bot,
            rooms,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
            page,
          );
        }
        return;
      }

      if (data.startsWith("mute:")) {
        const index = Number.parseInt(data.slice("mute:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        const room = findRoomByIndex(rooms, index);
        if (!room) {
          await ctx.answerCallbackQuery({ text: "Chat not found." });
          return;
        }
        state.muteRoom(room.id);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat muted" });
        await refreshReadMuteButton(ctx, config, state, room.id, index);
        return;
      }

      if (data.startsWith("unmute:")) {
        const index = Number.parseInt(data.slice("unmute:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        const room = findRoomByIndex(rooms, index);
        if (!room) {
          await ctx.answerCallbackQuery({ text: "Chat not found." });
          return;
        }
        state.unmuteRoom(room.id);
        await state.save();
        await ctx.answerCallbackQuery({ text: "Chat unmuted" });
        await refreshReadMuteButton(ctx, config, state, room.id, index);
        return;
      }

      if (data === "settings:muteall") {
        state.setMuteAll(true);
        await state.save();
        await ctx.answerCallbackQuery({ text: "All alerts muted" });
        if (ctx.callbackQuery.message) {
          await refreshSettings(
            bot,
            config,
            client,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data === "settings:unmuteall") {
        state.unmuteAll();
        await state.save();
        await ctx.answerCallbackQuery({ text: "All alerts unmuted" });
        if (ctx.callbackQuery.message) {
          await refreshSettings(
            bot,
            config,
            client,
            state,
            ctx.callbackQuery.message.chat.id,
            ctx.callbackQuery.message.message_id,
          );
        }
        return;
      }

      if (data === "settings:refresh") {
        if (!ctx.callbackQuery.message) {
          await ctx.answerCallbackQuery({ text: "Open /settings" });
          return;
        }
        await ctx.answerCallbackQuery();
        await refreshSettings(
          bot,
          config,
          client,
          state,
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
        );
        return;
      }

      if (data === "settings:help") {
        if (!ctx.callbackQuery.message) {
          await ctx.answerCallbackQuery({ text: "Use /help" });
          return;
        }
        await ctx.answerCallbackQuery();
        await editMessageToHelp(
          bot,
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
        );
        return;
      }

      if (data.startsWith("settings:chats:")) {
        const page = Number.parseInt(data.slice("settings:chats:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        await state.save();

        if (!ctx.callbackQuery.message) {
          await ctx.answerCallbackQuery();
          return;
        }

        await ctx.answerCallbackQuery();
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          manageChatsText(rooms, state, page),
          {
            parse_mode: "HTML",
            reply_markup: manageChatsKeyboard(rooms, state, page),
          },
        );
        return;
      }

      if (data.startsWith("rooms:page:")) {
        const page = Number.parseInt(data.slice("rooms:page:".length), 10);
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        await state.save();

        if (!ctx.callbackQuery.message) {
          await ctx.answerCallbackQuery();
          return;
        }

        await ctx.answerCallbackQuery();
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          buildRoomsText(rooms, page),
          {
            parse_mode: "HTML",
            reply_markup: roomsKeyboard(
              rooms,
              state,
              state.snapshot.selfUserId,
              page,
            ),
          },
        );
        return;
      }

      if (data === "rooms:refresh") {
        const rooms = await client.listRooms();
        state.setRoomOrder(rooms.map((room) => room.id));
        await state.save();

        if (!ctx.callbackQuery.message) {
          await ctx.answerCallbackQuery();
          return;
        }

        await ctx.answerCallbackQuery();
        await bot.api.editMessageText(
          ctx.callbackQuery.message.chat.id,
          ctx.callbackQuery.message.message_id,
          buildRoomsText(rooms, 0),
          {
            parse_mode: "HTML",
            reply_markup: roomsKeyboard(
              rooms,
              state,
              state.snapshot.selfUserId,
              0,
            ),
          },
        );
        return;
      }

      await safeAnswerCallback(ctx);
    } catch (error) {
      console.error("[bot] callback failed:", data, error);
      await safeAnswerCallback(ctx, { text: "Something went wrong." });
    }
  });
}