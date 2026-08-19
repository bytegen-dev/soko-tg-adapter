import type { Bot } from "grammy";

import type { Config } from "../config.js";
import { SokosumiClient } from "../sokosumi/client.js";
import type { StateStore } from "../state.js";
import { mainMenuInline } from "./menu-keyboard.js";
import { buildSettingsText, settingsKeyboard } from "./settings-view.js";
import { buildRoomsText, roomsKeyboard } from "./rooms-view.js";
import {
  ERROR_LOAD_CHATS,
  ERROR_LOAD_SETTINGS,
  HELP_TEXT,
  LOADING_CHATS,
  LOADING_SETTINGS,
  buildStartText,
  buildStatusText,
} from "./text.js";

async function syncRooms(
  client: SokosumiClient,
  state: StateStore,
): Promise<Awaited<ReturnType<SokosumiClient["listRooms"]>>> {
  const rooms = await client.listRooms();
  state.setRoomOrder(rooms.map((room) => room.id));
  await state.save();
  return rooms;
}

export async function editMessageToStart(
  bot: Bot,
  client: SokosumiClient,
  chatId: number,
  messageId: number,
): Promise<void> {
  const me = await client.getMe();
  await bot.api.editMessageText(chatId, messageId, buildStartText(me), {
    reply_markup: mainMenuInline(),
  });
}

export async function editMessageToHelp(
  bot: Bot,
  chatId: number,
  messageId: number,
): Promise<void> {
  await bot.api.editMessageText(chatId, messageId, HELP_TEXT, {
    reply_markup: mainMenuInline(),
  });
}

export async function editMessageToStatus(
  bot: Bot,
  config: Config,
  state: StateStore,
  chatId: number,
  messageId: number,
): Promise<void> {
  await bot.api.editMessageText(
    chatId,
    messageId,
    buildStatusText(config, state),
    { reply_markup: mainMenuInline() },
  );
}

export async function editMessageToRooms(
  bot: Bot,
  client: SokosumiClient,
  state: StateStore,
  chatId: number,
  messageId: number,
): Promise<void> {
  await bot.api.editMessageText(chatId, messageId, LOADING_CHATS);
  try {
    const rooms = await syncRooms(client, state);
    await bot.api.editMessageText(chatId, messageId, buildRoomsText(rooms), {
      parse_mode: "HTML",
      reply_markup: roomsKeyboard(rooms, state, state.snapshot.selfUserId),
    });
  } catch (error) {
    console.error("[bot] menu chats failed:", error);
    await bot.api.editMessageText(chatId, messageId, ERROR_LOAD_CHATS);
  }
}

export async function editMessageToSettings(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  chatId: number,
  messageId: number,
): Promise<void> {
  await bot.api.editMessageText(chatId, messageId, LOADING_SETTINGS);
  try {
    const rooms = await syncRooms(client, state);
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
  } catch (error) {
    console.error("[bot] menu settings failed:", error);
    await bot.api.editMessageText(chatId, messageId, ERROR_LOAD_SETTINGS);
  }
}
