import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

import { ensureAllowed } from "./access.js";
import type { Config } from "../config.js";
import {
  messageSenderName,
  roomDisplayName,
  SokosumiClient,
  truncate,
} from "../sokosumi/client.js";
import { buildChatRoomUrl } from "../sokosumi/links.js";
import type { StateStore } from "../state.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function resolveRoomId(state: StateStore, token: string): string | null {
  const trimmed = token.trim();
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return trimmed;
  }

  const index = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(index) || index < 1) {
    return null;
  }

  return state.snapshot.roomOrder[index - 1] ?? null;
}

export function registerCommands(
  bot: Bot,
  config: Config,
  client: SokosumiClient,
  state: StateStore,
): void {
  bot.command("start", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(
      [
        "Sokosumi DM alerts are on (humans + coworker agents like Alex).",
        "",
        "Commands:",
        "/rooms — list org DMs",
        "/read <n|roomId> — recent messages",
        "/send <n|roomId> <text> — reply",
        "/status — poll settings",
      ].join("\n"),
    );
  });

  bot.command("status", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(
      `Polling every ${config.POLL_INTERVAL_MS}ms for direct DMs (${config.SOKOSUMI_ORG_SLUG}) — humans + coworker 1:1.`,
    );
  });

  bot.command("rooms", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    try {
      const rooms = await client.listDirectRooms();
      state.setRoomOrder(rooms.map((room) => room.id));
      await state.save();

      if (rooms.length === 0) {
        await ctx.reply("No direct DMs yet (humans or coworker agents).");
        return;
      }

      const selfUserId = state.snapshot.selfUserId;
      const lines = rooms.map((room, index) => {
        const unread =
          room.unreadCount > 0 ? ` (${room.unreadCount} unread)` : "";
        return `${index + 1}. ${roomDisplayName(room, selfUserId)}${unread}\n   <code>${room.id}</code>`;
      });

      await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });
    } catch (error) {
      console.error("[bot] /rooms failed:", error);
      await ctx.reply("Could not load rooms. Check API key and org slug.");
    }
  });

  bot.command("read", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const token = ctx.match?.trim();
    if (!token) {
      await ctx.reply("Usage: /read <room number from /rooms or room UUID>");
      return;
    }

    const roomId = resolveRoomId(state, token);
    if (!roomId) {
      await ctx.reply("Unknown room. Run /rooms first.");
      return;
    }

    try {
      const rooms = await client.listDirectRooms();
      const room = rooms.find((entry) => entry.id === roomId);
      const { messages } = await client.listRoomMessages(roomId, { limit: 15 });
      if (messages.length === 0) {
        await ctx.reply("No messages yet.");
        return;
      }

      const selfUserId = state.snapshot.selfUserId;
      const title = room
        ? roomDisplayName(room, selfUserId)
        : "Direct message";
      const body = messages
        .map((message) => {
          const sender = messageSenderName(message);
          const text = message.deletedAt ? "[deleted]" : truncate(message.content, 500);
          return `<b>${escapeHtml(sender)}</b>: ${escapeHtml(text)}`;
        })
        .join("\n");

      await ctx.reply(`<b>${escapeHtml(title)}</b>\n\n${body}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(
          "Open in Sokosumi",
          buildChatRoomUrl(config, roomId),
        ),
      });
    } catch (error) {
      console.error("[bot] /read failed:", error);
      await ctx.reply("Could not load messages for that room.");
    }
  });

  bot.command("send", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }

    const raw = ctx.match?.trim() ?? "";
    const spaceIndex = raw.indexOf(" ");
    if (spaceIndex <= 0) {
      await ctx.reply("Usage: /send <room number or UUID> <message>");
      return;
    }

    const roomToken = raw.slice(0, spaceIndex);
    const content = raw.slice(spaceIndex + 1).trim();
    if (!content) {
      await ctx.reply("Message cannot be empty.");
      return;
    }

    const roomId = resolveRoomId(state, roomToken);
    if (!roomId) {
      await ctx.reply("Unknown room. Run /rooms first.");
      return;
    }

    try {
      const message = await client.sendMessage(roomId, content);
      state.setLastNotifiedMessageId(roomId, message.id);
      await state.save();
      await ctx.reply("Sent.");
    } catch (error) {
      console.error("[bot] /send failed:", error);
      await ctx.reply("Could not send message.");
    }
  });

  bot.command("help", async (ctx) => {
    if (!(await ensureAllowed(ctx, config, state))) {
      return;
    }
    await ctx.reply(
      "/rooms — DMs\n/read <n|id> — history\n/send <n|id> <text> — reply\n/status — poll interval",
    );
  });
}
