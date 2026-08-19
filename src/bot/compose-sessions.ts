export interface ComposeSession {
  roomId: string;
  title: string;
  roomIndex: number | null;
}

const sessions = new Map<string, ComposeSession>();

export function setComposeSession(
  telegramChatId: string,
  session: ComposeSession,
): void {
  sessions.set(telegramChatId, session);
}

export function getComposeSession(
  telegramChatId: string,
): ComposeSession | undefined {
  return sessions.get(telegramChatId);
}

export function hasComposeSession(telegramChatId: string): boolean {
  return sessions.has(telegramChatId);
}

export function clearComposeSession(telegramChatId: string): boolean {
  return sessions.delete(telegramChatId);
}
