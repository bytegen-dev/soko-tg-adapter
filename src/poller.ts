import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

import type { Config } from "./config.js";
import { getAllowedChatIds } from "./bot/access.js";
import { escapeHtml } from "./bot/text.js";
import {
  messageSenderName,
  roomDisplayName,
  SokosumiClient,
  truncate,
  type ChatRoom,
  type ChatRoomMessage,
} from "./sokosumi/client.js";
import { buildChatRoomUrl } from "./sokosumi/links.js";
import type { StateStore } from "./state.js";

function compareMessages(a: ChatRoomMessage, b: ChatRoomMessage): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return a.id.localeCompare(b.id);
}

function isFromSelf(message: ChatRoomMessage, selfUserId?: string): boolean {
  if (!selfUserId) {
    return false;
  }
  return (
    message.sender.type === "user" && message.sender.user?.id === selfUserId
  );
}

function formatAlert(room: ChatRoom, message: ChatRoomMessage): string {
  const title = roomDisplayName(room, undefined);
  const sender = messageSenderName(message);
  const body = truncate(message.content);
  return `<b>${escapeHtml(title)}</b>\n<b>${escapeHtml(sender)}:</b> ${escapeHtml(body)}`;
}

export class MessagePoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private bootstrapped = false;

  constructor(
    private readonly bot: Bot,
    private readonly config: Config,
    private readonly client: SokosumiClient,
    private readonly state: StateStore,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.pollOnce();
    } catch (error) {
      console.error("[poller] tick failed:", error);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const rooms = await this.client.listRooms();
    this.state.setRoomOrder(rooms.map((room) => room.id));

    const roomsToCheck = rooms.filter(
      (room) => room.unreadCount > 0 || !this.bootstrapped,
    );

    for (const room of roomsToCheck) {
      await this.syncRoom(room);
    }

    if (!this.bootstrapped) {
      this.bootstrapped = true;
      await this.state.save();
      console.log(
        `[poller] bootstrapped ${rooms.length} chat(s); live alerts on`,
      );
    }
  }

  private async syncRoom(room: ChatRoom): Promise<void> {
    const limit = Math.min(Math.max(room.unreadCount, 1) + 5, 50);
    const { messages } = await this.client.listRoomMessages(room.id, { limit });
    if (messages.length === 0) {
      return;
    }

    const sorted = [...messages].sort(compareMessages);
    const latest = sorted.at(-1);
    if (!latest) {
      return;
    }

    if (!this.bootstrapped) {
      this.state.seedLastNotifiedMessageId(room.id, latest.id);
      return;
    }

    const lastNotifiedId = this.state.getLastNotifiedMessageId(room.id);
    if (!lastNotifiedId) {
      this.state.setLastNotifiedMessageId(room.id, latest.id);
      await this.state.save();
      return;
    }

    const selfUserId = this.state.snapshot.selfUserId;
    const lastIndex = sorted.findIndex((message) => message.id === lastNotifiedId);
    let newMessages: ChatRoomMessage[];

    if (lastIndex >= 0) {
      newMessages = sorted.slice(lastIndex + 1);
    } else if (room.unreadCount > 0) {
      newMessages = sorted
        .filter(
          (message) => !message.deletedAt && !isFromSelf(message, selfUserId),
        )
        .slice(-room.unreadCount);
    } else {
      newMessages = [];
    }

    let lastSentId = lastNotifiedId;

    for (const message of newMessages) {
      if (message.deletedAt || isFromSelf(message, selfUserId)) {
        lastSentId = message.id;
        continue;
      }

      if (this.state.shouldNotify(room.id)) {
        await this.notifyAll(room, message);
      }
      lastSentId = message.id;
    }

    if (lastSentId !== lastNotifiedId) {
      this.state.setLastNotifiedMessageId(room.id, lastSentId);
      await this.state.save();
    }
  }

  private roomKeyboard(roomId: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    keyboard.text("View chat", `read:oid:${roomId}`);
    keyboard.row().url("Open in Sokosumi", buildChatRoomUrl(this.config, roomId));
    if (!this.state.isRoomMuted(roomId)) {
      keyboard.row().text("Mute chat", `mute:oid:${roomId}`);
    }
    return keyboard;
  }

  private async notifyAll(room: ChatRoom, message: ChatRoomMessage): Promise<void> {
    const chatIds = getAllowedChatIds(this.config, this.state);
    if (chatIds.length === 0) {
      return;
    }

    const text = formatAlert(room, message);
    const keyboard = this.roomKeyboard(room.id);
    await Promise.all(
      chatIds.map((chatId) =>
        this.bot.api.sendMessage(chatId, text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        }),
      ),
    );
  }
}
