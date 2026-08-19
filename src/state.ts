import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BotState {
  /** Latest message id we've notified for, per room. */
  lastNotifiedMessageId: Record<string, string>;
  /** Cached self user id from Sokosumi (optional). */
  selfUserId?: string;
  /** Room list cache for /read shorthand by index. */
  roomOrder: string[];
  /** First /start when no allowlist is configured. */
  registeredChatIds: string[];
  /** Room ids with alerts suppressed in Telegram. */
  mutedRoomIds: string[];
  /** When true, no Telegram alerts are sent. */
  muteAll: boolean;
}

const DEFAULT_STATE: BotState = {
  lastNotifiedMessageId: {},
  roomOrder: [],
  registeredChatIds: [],
  mutedRoomIds: [],
  muteAll: false,
};

export class StateStore {
  private state: BotState = { ...DEFAULT_STATE, lastNotifiedMessageId: {} };
  private readonly filePath: string;

  constructor(dataDir = path.join(process.cwd(), ".data")) {
    this.filePath = path.join(dataDir, "state.json");
  }

  get snapshot(): BotState {
    return this.state;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BotState>;
      this.state = {
        lastNotifiedMessageId: parsed.lastNotifiedMessageId ?? {},
        selfUserId: parsed.selfUserId,
        roomOrder: parsed.roomOrder ?? [],
        registeredChatIds: parsed.registeredChatIds ?? [],
        mutedRoomIds: parsed.mutedRoomIds ?? [],
        muteAll: parsed.muteAll ?? false,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  setSelfUserId(userId: string): void {
    this.state.selfUserId = userId;
  }

  setRoomOrder(roomIds: string[]): void {
    this.state.roomOrder = roomIds;
  }

  getLastNotifiedMessageId(roomId: string): string | undefined {
    return this.state.lastNotifiedMessageId[roomId];
  }

  setLastNotifiedMessageId(roomId: string, messageId: string): void {
    this.state.lastNotifiedMessageId[roomId] = messageId;
  }

  seedLastNotifiedMessageId(roomId: string, messageId: string): void {
    if (!this.state.lastNotifiedMessageId[roomId]) {
      this.state.lastNotifiedMessageId[roomId] = messageId;
    }
  }

  registerChatId(chatId: string): void {
    if (!this.state.registeredChatIds.includes(chatId)) {
      this.state.registeredChatIds.push(chatId);
    }
  }

  isRoomMuted(roomId: string): boolean {
    if (this.state.muteAll) {
      return true;
    }
    return this.state.mutedRoomIds.includes(roomId);
  }

  shouldNotify(roomId: string): boolean {
    return !this.isRoomMuted(roomId);
  }

  muteRoom(roomId: string): void {
    if (!this.state.mutedRoomIds.includes(roomId)) {
      this.state.mutedRoomIds.push(roomId);
    }
  }

  unmuteRoom(roomId: string): void {
    this.state.mutedRoomIds = this.state.mutedRoomIds.filter(
      (id) => id !== roomId,
    );
  }

  setMuteAll(enabled: boolean): void {
    this.state.muteAll = enabled;
  }

  unmuteAll(): void {
    this.state.muteAll = false;
    this.state.mutedRoomIds = [];
  }
}
