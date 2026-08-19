import type { Bot, Context } from "grammy";

import { ensureAllowed } from "./access.js";
import { mainMenuKeyboard, matchMenuKey, type MenuKey } from "./menu-keyboard.js";
import { resolveRoomId } from "./resolve-room.js";
import { sendReadView } from "./read-actions.js";
import { buildRoomsText, roomsKeyboard } from "./rooms-view.js";
import { buildSettingsText, settingsKeyboard } from "./settings-view.js";
import { HELP_TEXT, START_TEXT, LOADING_CHATS, LOADING_SETTINGS, ERROR_LOAD_CHATS, ERROR_LOAD_SETTINGS, ERROR_GENERIC } from "./text.js";
import { E, withEmoji } from "./emoji.js";
import type { Config } from "../config.js";
import { SokosumiClient } from "../sokosumi/client.js";
import type { StateStore } from "../state.js";

function matchCommandArg(ctx: Context): string {
  const m = ctx.match;
  if (typeof m === "string") {
    return m.trim();
  }
  if (Array.isArray(m)) {
    return (m[0] ?? "").trim();
  }
  return "";
}

async function syncRooms(
  client: SokosumiClient,
  state: StateStore,
): Promise<Awaited<ReturnType<SokosumiClient["listRooms"]>>> {
  const rooms = await client.listRooms();
  state.setRoomOrder(rooms.map((room) => room.id));
  await state.save();
  return rooms;
}

function statusText(config: Config, state: StateStore): string {
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
  ].join("\n");
}

async function replyRooms(
  ctx: Context,
  client: SokosumiClient,
  state: StateStore,
  menu: ReturnType<typeof mainMenuKeyboard>,
): Promise<void> {
  const loading = await ctx.reply(LOADING_CHATS, { reply_markup: menu });
  try {
    const rooms = await syncRooms(client, state);
    await ctx.api.editMessageText(
      loading.chat.id,
      loading.message_id,
      buildRoomsText(rooms),
      {
        parse_mode: "HTML",
        reply_markup: roomsKeyboard(rooms, state, state.snapshot.selfUserId),
      },
    );
  } catch (error) {
    console.error("[bot] rooms failed:", error);
    await ctx.api.editMessageText(
      loading.chat.id,
      loading.message_id,
      ERROR_LOAD_CHATS,
    );
  }
}

async function replySettings(
  ctx: Context,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
  menu: ReturnType<typeof mainMenuKeyboard>,
): Promise<void> {
  const loading = await ctx.reply(LOADING_SETTINGS, { reply_markup: menu });
  try {
    const rooms = await syncRooms(client, state);
    await ctx.api.editMessageText(
      loading.chat.id,
      loading.message_id,
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
    console.error("[bot] settings failed:", error);
    await ctx.api.editMessageText(
      loading.chat.id,
      loading.message_id,
      ERROR_LOAD_SETTINGS,
    );
  }
}

export function registerCommands(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
): void {
  const menu = mainMenuKeyboard();

  bot.use(async (ctx, next) => {
    const text = ctx.message?.text;
    if (text) {
      console.log(`[bot] message: ${text.slice(0, 80)}`);
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    try {
      if (!(await ensureAllowed(ctx, config, state))) {
        return;
      }
      await ctx.reply(START_TEXT, { reply_markup: menu });
    } catch (error) {
      console.error("[bot] /start failed:", error);
      await ctx.reply(ERROR_GENERIC, {
        reply_markup: menu,
      });
    }
  });

  bot.command("help", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(HELP_TEXT, { reply_markup: menu });
  });

  bot.command("status", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(statusText(config, state), { reply_markup: menu });
  });

  bot.command("settings", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await replySettings(ctx, config, client, state, menu);
  });

  bot.command("rooms", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await replyRooms(ctx, client, state, menu);
  });

  bot.on("message:text").filter(
    (ctx) => matchMenuKey(ctx.message.text) !== null,
    async (ctx) => {
      if (!(await ensureAllowed(ctx, config, state))) {
        return;
      }

      const key = matchMenuKey(ctx.message.text);
      if (!key) {
        return;
      }

      switch (key) {
        case "chats":
          await replyRooms(ctx, client, state, menu);
          break;
        case "settings":
          await replySettings(ctx, config, client, state, menu);
          break;
        case "help":
          await ctx.reply(HELP_TEXT, { reply_markup: menu });
          break;
        case "status":
          await ctx.reply(statusText(config, state), { reply_markup: menu });
          break;
      }
    },
  );

  bot.command("read", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const token = ctx.match?.trim();
    if (!token) {
      await ctx.reply("Usage: /read <number from /rooms or room id>", {
        reply_markup: menu,
      });
      return;
    }

    const roomId = resolveRoomId(state, token);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.", { reply_markup: menu });
      return;
    }

    const index = Number.parseInt(token, 10);
    const roomIndex = Number.isFinite(index) && index >= 1 ? index : null;

    try {
      await sendReadView(ctx, config, client, state, roomId, roomIndex);
    } catch (error) {
      console.error("[bot] /read failed:", error);
      await ctx.reply(withEmoji(E.warn, "Could not load messages for that chat."), {
        reply_markup: menu,
      });
    }
  });

  bot.command("send", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const raw = ctx.match?.trim() ?? "";
    const spaceIndex = raw.indexOf(" ");
    if (spaceIndex <= 0) {
      await ctx.reply("Usage: /send <number or room id> <message>", {
        reply_markup: menu,
      });
      return;
    }

    const roomToken = raw.slice(0, spaceIndex);
    const content = raw.slice(spaceIndex + 1).trim();
    if (!content) {
      await ctx.reply("Message cannot be empty.", { reply_markup: menu });
      return;
    }

    const roomId = resolveRoomId(state, roomToken);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.", { reply_markup: menu });
      return;
    }

    try {
      const message = await client.sendMessage(roomId, content);
      state.setLastNotifiedMessageId(roomId, message.id);
      await state.save();
      await ctx.reply(withEmoji(E.sent, "Sent."), { reply_markup: menu });
    } catch (error) {
      console.error("[bot] /send failed:", error);
      await ctx.reply(withEmoji(E.warn, "Could not send message."), { reply_markup: menu });
    }
  });

  async function muteByToken(ctx: Context, mute: boolean): Promise<void> {
    const token = matchCommandArg(ctx);
    if (!token) {
      await ctx.reply(`Usage: /${mute ? "mute" : "unmute"} <number from /rooms>`, {
        reply_markup: menu,
      });
      return;
    }

    const roomId = resolveRoomId(state, token);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.", { reply_markup: menu });
      return;
    }

    if (mute) {
      state.muteRoom(roomId);
    } else {
      state.unmuteRoom(roomId);
    }
    await state.save();
    await ctx.reply(
      mute ? withEmoji(E.mute, "Chat muted.") : withEmoji(E.unmute, "Chat unmuted."),
      { reply_markup: menu },
    );
  }

  bot.command("mute", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await muteByToken(ctx, true);
  });

  bot.command("unmute", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await muteByToken(ctx, false);
  });

  bot.command("muteall", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    state.setMuteAll(true);
    await state.save();
    await ctx.reply(withEmoji(E.mute, "All alerts muted."), { reply_markup: menu });
  });

  bot.command("unmuteall", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    state.unmuteAll();
    await state.save();
    await ctx.reply(withEmoji(E.unmute, "All alerts unmuted."), { reply_markup: menu });
  });
}
