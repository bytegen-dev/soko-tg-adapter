import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BotState {
  /** Latest message id we've notified for, per room. */
  lastNotifiedMessageId: Record<string, string>;
  /** Cached self user id from Sokosumi (optional). */
  selfUserId?: string;
  /** Room list cache for /read shorthand by index. */
  roomOrder: string[];
}

const DEFAULT_STATE: BotState = {
  lastNotifiedMessageId: {},
  roomOrder: [],
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
}
