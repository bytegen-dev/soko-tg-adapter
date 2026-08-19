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

  async listDirectRooms(): Promise<ChatRoom[]> {
    const rooms: ChatRoom[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({
        kind: "direct",
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

    return rooms.filter(isHumanDirectRoom);
  }

  async listRoomMessages(
    roomId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ messages: ChatRoomMessage[]; nextCursor: string | null }> {
    const query = new URLSearchParams({
      limit: String(options?.limit ?? 30),
    });
    if (options?.cursor) {
      query.set("cursor", options.cursor);
    }

    const response = await this.request<ListResponse<ChatRoomMessage[]>>(
      `/chats/rooms/${encodeURIComponent(roomId)}/messages?${query.toString()}`,
    );

    return {
      messages: response.data,
      nextCursor: response.meta.pagination?.nextCursor ?? null,
    };
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
}

export function isHumanDirectRoom(room: ChatRoom): boolean {
  return room.kind === "direct" && room.coworkerMembers.length === 0;
}

export function roomDisplayName(room: ChatRoom, selfUserId?: string): string {
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
