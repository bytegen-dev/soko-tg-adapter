import type { Bot } from "grammy";
import type { InlineKeyboard } from "grammy";

import type { Config } from "./config.js";
import { getAllowedChatIds } from "./bot/access.js";
import { escapeTelegramPlain } from "./bot/text.js";
import { formatMessageHtml } from "./bot/markup.js";
import { alertKeyboard } from "./bot/read-view.js";
import { E, roomEmoji } from "./bot/emoji.js";
import {
  compareChatRoomMessages,
  messageSenderName,
  roomDisplayName,
  roomHasUnread,
  SokosumiClient,
  type ChatRoom,
  type ChatRoomMessage,
} from "./sokosumi/client.js";
import type { StateStore } from "./state.js";

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
  const icon = roomEmoji(room);
  const threadLine = message.parentMessageId
    ? `\n${E.thread} <i>Thread reply</i>`
    : "";
  return [
    `<b>${E.unread} New message</b>`,
    `${icon} <b>${escapeTelegramPlain(title)}</b>${threadLine}`,
    `<b>${escapeTelegramPlain(sender)}:</b> ${formatMessageHtml(message.content, 350)}`,
  ].join("\n");
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
      (room) =>
        room.unreadCount > 0 ||
        room.unreadMentionCount > 0 ||
        !this.bootstrapped,
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
    const { messages } = await this.client.listRoomMessagesWithThreads(
      room.id,
      { limit },
    );
    if (messages.length === 0) {
      return;
    }

    const sorted = [...messages].sort(compareChatRoomMessages);
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

  private roomKeyboard(room: ChatRoom, message: ChatRoomMessage): InlineKeyboard {
    return alertKeyboard(
      this.config,
      this.state,
      room.id,
      roomHasUnread(room),
      message.id,
    );
  }

  private async notifyAll(room: ChatRoom, message: ChatRoomMessage): Promise<void> {
    const chatIds = getAllowedChatIds(this.config, this.state);
    if (chatIds.length === 0) {
      return;
    }

    const text = formatAlert(room, message);
    const keyboard = this.roomKeyboard(room, message);
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
