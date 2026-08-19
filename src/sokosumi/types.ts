export type ChatRoomPresence = "online" | "afk" | "offline";

export interface ChatRoomUserParticipant {
  id: string;
  name: string;
  email: string;
  image: string | null;
  presence: ChatRoomPresence;
}

export interface ChatRoomCoworkerParticipant {
  id: string;
  name: string;
  slug: string;
}

export interface ChatRoom {
  id: string;
  organizationId: string | null;
  name: string;
  slug: string;
  kind: "channel" | "direct";
  directKey: string | null;
  unreadCount: number;
  unreadMentionCount: number;
  markedUnread?: boolean;
  mutedAt: string | null;
  userMembers: ChatRoomUserParticipant[];
  coworkerMembers: ChatRoomCoworkerParticipant[];
  updatedAt: string;
}

export interface ChatRoomMessageSender {
  type: "user" | "coworker" | "unknown";
  user?: ChatRoomUserParticipant;
  coworker?: ChatRoomCoworkerParticipant;
}

export interface ChatRoomMessage {
  id: string;
  roomId: string;
  parentMessageId?: string | null;
  content: string;
  createdAt: string;
  deletedAt: string | null;
  sender: ChatRoomMessageSender;
  threadReplyCount?: number;
  threadLastReplyAt?: string | null;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListResponse<T> {
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
    pagination?: PaginationMeta;
  };
}
