import type { Bot, Context } from "grammy";

import { ensureAllowed } from "./access.js";
import {
  clearReplyKeyboard,
  mainMenuInline,
  matchMenuKey,
} from "./menu-keyboard.js";
import { editMessageOrReply } from "./message-utils.js";
import { resolveRoomId } from "./resolve-room.js";
import { sendReadView } from "./read-actions.js";
import { buildRoomsText, roomsKeyboard } from "./rooms-view.js";
import { buildSettingsText, settingsKeyboard } from "./settings-view.js";
import { getComposeSession, hasComposeSession } from "./compose-sessions.js";
import {
  cancelCompose,
  deliverRoomMessage,
  sendComposedMessage,
} from "./send-actions.js";
import { HELP_TEXT, buildStartText, LOADING_CHATS, LOADING_SETTINGS, ERROR_LOAD_CHATS, ERROR_LOAD_SETTINGS, ERROR_GENERIC, buildStatusText } from "./text.js";
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

async function replyRooms(
  ctx: Context,
  client: SokosumiClient,
  state: StateStore,
): Promise<void> {
  const loading = await ctx.reply(LOADING_CHATS);
  try {
    const rooms = await syncRooms(client, state);
    await editMessageOrReply(ctx, loading, buildRoomsText(rooms), {
      parse_mode: "HTML",
      reply_markup: roomsKeyboard(rooms, state, state.snapshot.selfUserId),
    });
  } catch (error) {
    console.error("[bot] rooms failed:", error);
    await editMessageOrReply(ctx, loading, ERROR_LOAD_CHATS);
  }
}

async function replySettings(
  ctx: Context,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
): Promise<void> {
  const loading = await ctx.reply(LOADING_SETTINGS);
  try {
    const rooms = await syncRooms(client, state);
    await editMessageOrReply(
      ctx,
      loading,
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
    await editMessageOrReply(ctx, loading, ERROR_LOAD_SETTINGS);
  }
}

export function registerCommands(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
): void {
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
      await clearReplyKeyboard(ctx);
      const me = await client.getMe();
      await ctx.reply(buildStartText(me), { reply_markup: mainMenuInline() });
    } catch (error) {
      console.error("[bot] /start failed:", error);
      await ctx.reply(ERROR_GENERIC);
    }
  });

  bot.command("help", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(HELP_TEXT, { reply_markup: mainMenuInline() });
  });

  bot.command("status", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(buildStatusText(config, state), {
      reply_markup: mainMenuInline(),
    });
  });

  bot.command("settings", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await replySettings(ctx, config, client, state);
  });

  bot.command("rooms", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await replyRooms(ctx, client, state);
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
          await replyRooms(ctx, client, state);
          break;
        case "settings":
          await replySettings(ctx, config, client, state);
          break;
        case "help":
          await ctx.reply(HELP_TEXT, { reply_markup: mainMenuInline() });
          break;
        case "status":
          await ctx.reply(buildStatusText(config, state), {
            reply_markup: mainMenuInline(),
          });
          break;
      }
    },
  );

  bot.on("message:text").filter(
    (ctx) => {
      const text = ctx.message.text.trim();
      if (text.startsWith("/")) {
        return false;
      }
      if (matchMenuKey(text)) {
        return false;
      }
      const chatId = ctx.chat?.id;
      if (!chatId) {
        return false;
      }
      return hasComposeSession(String(chatId));
    },
    async (ctx) => {
      if (!(await ensureAllowed(ctx, config, state))) {
        return;
      }

      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      const session = getComposeSession(String(chatId));
      if (!session) {
        return;
      }

      const content = ctx.message.text.trim();
      if (!content) {
        await ctx.reply(withEmoji(E.warn, "Message cannot be empty."));
        return;
      }

      try {
        await sendComposedMessage(
          ctx,
          config,
          client,
          state,
          session.roomId,
          session.title,
          session.roomIndex,
          content,
        );
      } catch (error) {
        console.error("[bot] compose send failed:", error);
        await ctx.reply(withEmoji(E.warn, "Could not send message."));
      }
    },
  );

  bot.command("read", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const token = ctx.match?.trim();
    if (!token) {
      await ctx.reply("Usage: /read <number from /rooms or room id>");
      return;
    }

    const roomId = resolveRoomId(state, token);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.");
      return;
    }

    const index = Number.parseInt(token, 10);
    const roomIndex = Number.isFinite(index) && index >= 1 ? index : null;

    try {
      await sendReadView(ctx, config, client, state, roomId, roomIndex);
    } catch (error) {
      console.error("[bot] /read failed:", error);
      await ctx.reply(withEmoji(E.warn, "Could not load messages for that chat."));
    }
  });

  bot.command("send", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const raw = matchCommandArg(ctx);
    const spaceIndex = raw.indexOf(" ");
    if (spaceIndex <= 0) {
      await ctx.reply(
        withEmoji(E.reply, "Usage: /send <number> <message> or tap Reply in a chat."),
      );
      return;
    }

    const roomToken = raw.slice(0, spaceIndex);
    const content = raw.slice(spaceIndex + 1).trim();
    if (!content) {
      await ctx.reply(withEmoji(E.warn, "Message cannot be empty."));
      return;
    }

    const roomId = resolveRoomId(state, roomToken);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.");
      return;
    }

    const index = Number.parseInt(roomToken, 10);
    const roomIndex = Number.isFinite(index) && index >= 1 ? index : null;

    try {
      await deliverRoomMessage(client, state, roomId, content);
      await ctx.reply(withEmoji(E.sent, "Sent."));
      await sendReadView(ctx, config, client, state, roomId, roomIndex);
    } catch (error) {
      console.error("[bot] /send failed:", error);
      await ctx.reply(withEmoji(E.warn, "Could not send message."));
    }
  });

  bot.command("cancel", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    const cancelled = await cancelCompose(ctx);
    if (!cancelled) {
      await ctx.reply("Nothing to cancel.");
    }
  });

  async function muteByToken(ctx: Context, mute: boolean): Promise<void> {
    const token = matchCommandArg(ctx);
    if (!token) {
      await ctx.reply(`Usage: /${mute ? "mute" : "unmute"} <number from /rooms>`);
      return;
    }

    const roomId = resolveRoomId(state, token);
    if (!roomId) {
      await ctx.reply("Unknown chat. Run /rooms first.");
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
    await ctx.reply(withEmoji(E.mute, "All alerts muted."));
  });

  bot.command("unmuteall", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    state.unmuteAll();
    await state.save();
    await ctx.reply(withEmoji(E.unmute, "All alerts unmuted."));
  });
}
