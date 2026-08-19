import type { Config } from "../config.js";

export function buildChatRoomUrl(config: Config, roomId: string): string {
  const base = config.SOKOSUMI_WEB_BASE_URL.replace(/\/$/, "");
  return `${base}/chat/rooms/${encodeURIComponent(roomId)}`;
}
