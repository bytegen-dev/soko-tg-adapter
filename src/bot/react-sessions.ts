export interface ReactSession {
  roomId: string;
  messageId: string;
}

const sessions = new Map<string, ReactSession>();

/** Short callback token — Telegram callback_data max is 64 bytes. */
export function createReactSession(session: ReactSession): string {
  const id = crypto.randomUUID().slice(0, 8);
  sessions.set(id, session);
  return id;
}

export function getReactSession(id: string): ReactSession | undefined {
  return sessions.get(id);
}

export function reactCallbackData(sessionId: string): string {
  return `react:${sessionId}`;
}
