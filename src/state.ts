import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  DEFAULT_QUIET_TIMEZONE,
  quietHoursActive,
} from "./bot/quiet-hours.js";

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
  /** When true, pause alerts during the daily quiet window. */
  quietHoursEnabled: boolean;
  /** Daily quiet window start (HH:MM, 24h). */
  quietHoursStart: string;
  /** Daily quiet window end (HH:MM, 24h). */
  quietHoursEnd: string;
  /** IANA timezone for quiet hours. */
  quietHoursTimezone: string;
}

const DEFAULT_STATE: BotState = {
  lastNotifiedMessageId: {},
  roomOrder: [],
  registeredChatIds: [],
  mutedRoomIds: [],
  muteAll: false,
  quietHoursEnabled: false,
  quietHoursStart: DEFAULT_QUIET_START,
  quietHoursEnd: DEFAULT_QUIET_END,
  quietHoursTimezone: DEFAULT_QUIET_TIMEZONE,
};

export class StateStore {
  private state: BotState = { ...DEFAULT_STATE, lastNotifiedMessageId: {} };
  private readonly filePath: string;

  constructor(dataDir?: string) {
    const dir =
      dataDir ??
      process.env.STATE_DATA_DIR ??
      path.join(process.cwd(), ".data");
    this.filePath = path.join(dir, "state.json");
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
        quietHoursEnabled: parsed.quietHoursEnabled ?? false,
        quietHoursStart: parsed.quietHoursStart ?? DEFAULT_QUIET_START,
        quietHoursEnd: parsed.quietHoursEnd ?? DEFAULT_QUIET_END,
        quietHoursTimezone: parsed.quietHoursTimezone ?? DEFAULT_QUIET_TIMEZONE,
      };
      if (
        this.state.quietHoursStart === "09:00" &&
        this.state.quietHoursEnd === "18:00"
      ) {
        this.state.quietHoursStart = DEFAULT_QUIET_START;
        this.state.quietHoursEnd = DEFAULT_QUIET_END;
      }
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

  shouldNotify(roomId: string, now = new Date()): boolean {
    if (this.isRoomMuted(roomId)) {
      return false;
    }
    if (quietHoursActive(this.state, now)) {
      return false;
    }
    return true;
  }

  setQuietHoursEnabled(enabled: boolean): void {
    this.state.quietHoursEnabled = enabled;
  }

  setQuietHoursStart(time: string): void {
    this.state.quietHoursStart = time;
  }

  setQuietHoursEnd(time: string): void {
    this.state.quietHoursEnd = time;
  }

  setQuietHoursTimezone(timezone: string): void {
    this.state.quietHoursTimezone = timezone;
  }

  isQuietHoursActive(now = new Date()): boolean {
    return quietHoursActive(this.state, now);
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
