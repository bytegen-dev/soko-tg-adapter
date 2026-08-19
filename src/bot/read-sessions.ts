import type { ChatRoomMessage } from "../sokosumi/types.js";

export interface ReadSession {
  roomId: string;
  roomIndex: number | null;
  title: string;
  messages: ChatRoomMessage[];
  nextCursor: string | null;
}

const sessions = new Map<string, ReadSession>();

export function createReadSession(session: ReadSession): string {
  const id = crypto.randomUUID().slice(0, 8);
  sessions.set(id, session);
  return id;
}

export function getReadSession(id: string): ReadSession | undefined {
  return sessions.get(id);
}

export function updateReadSession(id: string, session: ReadSession): void {
  sessions.set(id, session);
}

export function deleteReadSession(id: string): void {
  sessions.delete(id);
}
