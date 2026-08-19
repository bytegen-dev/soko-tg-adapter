import type { StateStore } from "../state.js";

export function resolveRoomId(state: StateStore, token: string): string | null {
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

export function resolveRoomIndex(state: StateStore, roomId: string): number | null {
  const index = state.snapshot.roomOrder.indexOf(roomId);
  return index >= 0 ? index + 1 : null;
}
