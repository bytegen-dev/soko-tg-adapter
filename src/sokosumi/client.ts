import type { Config } from "../config.js";
import type {
  ChatRoom,
  ChatRoomMessage,
  ListResponse,
} from "./types.js";

export type { ChatRoom, ChatRoomMessage } from "./types.js";

export class SokosumiApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "SokosumiApiError";
  }
}

export class SokosumiClient {
  private readonly baseUrl: string;

  constructor(private readonly config: Config) {
    this.baseUrl = config.SOKOSUMI_CORE_BASE_URL.replace(/\/$/, "");
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.SOKOSUMI_API_KEY}`,
      "X-Organization-Slug": this.config.SOKOSUMI_ORG_SLUG,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new SokosumiApiError(
        `Sokosumi ${init?.method ?? "GET"} ${path} failed`,
        response.status,
        text,
      );
    }

    return JSON.parse(text) as T;
  }

  async listRooms(): Promise<ChatRoom[]> {
    const rooms: ChatRoom[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({
        status: "active",
        limit: "100",
      });
      if (cursor) {
        query.set("cursor", cursor);
      }

      const response = await this.request<ListResponse<ChatRoom[]>>(
        `/chats/rooms?${query.toString()}`,
      );
      rooms.push(...response.data);

      const nextCursor = response.meta.pagination?.nextCursor ?? null;
      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    return rooms.filter(isNotifiableRoom);
  }

  /** @deprecated Use listRooms */
  async listDirectRooms(): Promise<ChatRoom[]> {
    return this.listRooms();
  }

  async listRoomMessages(
    roomId: string,
    options?: {
      limit?: number;
      cursor?: string;
      parentMessageId?: string;
    },
  ): Promise<{ messages: ChatRoomMessage[]; nextCursor: string | null }> {
    const query = new URLSearchParams({
      limit: String(options?.limit ?? 30),
    });
    if (options?.cursor) {
      query.set("cursor", options.cursor);
    }
    if (options?.parentMessageId) {
      query.set("parentMessageId", options.parentMessageId);
    }

    const response = await this.request<ListResponse<ChatRoomMessage[]>>(
      `/chats/rooms/${encodeURIComponent(roomId)}/messages?${query.toString()}`,
    );

    return {
      messages: response.data,
      nextCursor: response.meta.pagination?.nextCursor ?? null,
    };
  }

  /**
   * Top-level timeline plus recent thread replies. Sokosumi counts thread
   * messages in unreadCount, but GET /messages defaults to parentMessageId=null.
   */
  async listRoomMessagesWithThreads(
    roomId: string,
    options?: { limit?: number; maxThreadParents?: number },
  ): Promise<{ messages: ChatRoomMessage[]; nextCursor: string | null }> {
    const limit = options?.limit ?? 30;
    const maxThreadParents = options?.maxThreadParents ?? 6;

    const { messages: topLevel, nextCursor } = await this.listRoomMessages(
      roomId,
      { limit },
    );

    const threadParents = [...topLevel]
      .filter((message) => (message.threadReplyCount ?? 0) > 0)
      .sort((left, right) => {
        const leftTime = Date.parse(
          left.threadLastReplyAt ?? left.createdAt,
        );
        const rightTime = Date.parse(
          right.threadLastReplyAt ?? right.createdAt,
        );
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return right.id.localeCompare(left.id);
      })
      .slice(0, maxThreadParents);

    if (threadParents.length === 0) {
      return { messages: topLevel, nextCursor };
    }

    const threadPages = await Promise.all(
      threadParents.map((parent) =>
        this.listRoomMessages(roomId, {
          parentMessageId: parent.id,
          limit: Math.min(Math.max(parent.threadReplyCount ?? 1, 1) + 2, 30),
        }),
      ),
    );

    const byId = new Map<string, ChatRoomMessage>();
    for (const message of topLevel) {
      byId.set(message.id, message);
    }
    for (const page of threadPages) {
      for (const message of page.messages) {
        byId.set(message.id, message);
      }
    }

    const messages = [...byId.values()].sort(compareChatRoomMessages);
    return { messages, nextCursor };
  }

  async sendMessage(roomId: string, content: string): Promise<ChatRoomMessage> {
    const response = await this.request<{ data: ChatRoomMessage }>(
      `/chats/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
    return response.data;
  }

  async getMe(): Promise<{ id: string; name: string; email: string }> {
    const response = await this.request<{
      data: { id: string; name: string; email: string };
    }>("/users/me");
    return response.data;
  }

  async markRoomRead(roomId: string): Promise<void> {
    await this.request(`/chats/rooms/${encodeURIComponent(roomId)}/read`, {
      method: "POST",
    });
  }

  async toggleReaction(
    roomId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatRoomMessage> {
    const response = await this.request<{ data: ChatRoomMessage }>(
      `/chats/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        body: JSON.stringify({ emoji }),
      },
    );
    return response.data;
  }
}

export function isHumanDirectRoom(room: ChatRoom): boolean {
  return room.kind === "direct" && room.coworkerMembers.length === 0;
}

/** 1:1 direct with a single AI coworker (e.g. Alex). */
export function isCoworkerDirectRoom(room: ChatRoom): boolean {
  return (
    room.kind === "direct" &&
    room.coworkerMembers.length === 1 &&
    room.userMembers.length === 1
  );
}

/** Org channels the caller is a member of. */
export function isChannelRoom(room: ChatRoom): boolean {
  return room.kind === "channel";
}

/** Human DMs, coworker 1:1 DMs, and org channels. */
export function isNotifiableRoom(room: ChatRoom): boolean {
  if (isChannelRoom(room)) {
    return true;
  }
  return isNotifiableDirectRoom(room);
}

/** Human 1:1/group DMs and coworker 1:1 DMs — not channels. */
export function isNotifiableDirectRoom(room: ChatRoom): boolean {
  return isHumanDirectRoom(room) || isCoworkerDirectRoom(room);
}

export function roomHasUnread(room: ChatRoom): boolean {
  return (
    room.unreadCount > 0 ||
    room.unreadMentionCount > 0 ||
    room.markedUnread === true
  );
}

export function roomDisplayName(room: ChatRoom, selfUserId?: string): string {
  if (isChannelRoom(room)) {
    const name = room.name || room.slug;
    return name.startsWith("#") ? name : `#${name}`;
  }

  if (isCoworkerDirectRoom(room)) {
    return room.coworkerMembers[0]?.name ?? room.name ?? room.slug;
  }

  if (room.userMembers.length === 0) {
    return room.name || room.slug;
  }

  const others = room.userMembers.filter(
    (member) => !selfUserId || member.id !== selfUserId,
  );
  if (others.length === 0) {
    return room.name || room.slug;
  }
  if (others.length === 1) {
    return others[0]?.name ?? room.name;
  }
  return others.map((member) => member.name).join(", ");
}

export function messageSenderName(message: ChatRoomMessage): string {
  if (message.sender.type === "user" && message.sender.user) {
    return message.sender.user.name;
  }
  if (message.sender.type === "coworker" && message.sender.coworker) {
    return message.sender.coworker.name;
  }
  return "Someone";
}

export function truncate(text: string, max = 350): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export function compareChatRoomMessages(
  a: ChatRoomMessage,
  b: ChatRoomMessage,
): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return a.id.localeCompare(b.id);
}
