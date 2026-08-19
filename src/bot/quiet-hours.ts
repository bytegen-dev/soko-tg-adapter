export const DEFAULT_QUIET_START = "09:00";
export const DEFAULT_QUIET_END = "18:00";
export const DEFAULT_QUIET_TIMEZONE = "UTC";

export const QUIET_TIME_PRESETS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "12:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "22:00",
] as const;

export interface TimezoneOption {
  id: number;
  label: string;
  iana: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 0, label: "UTC", iana: "UTC" },
  { id: 1, label: "London", iana: "Europe/London" },
  { id: 2, label: "Berlin", iana: "Europe/Berlin" },
  { id: 3, label: "Paris", iana: "Europe/Paris" },
  { id: 4, label: "New York", iana: "America/New_York" },
  { id: 5, label: "Chicago", iana: "America/Chicago" },
  { id: 6, label: "Los Angeles", iana: "America/Los_Angeles" },
  { id: 7, label: "Tokyo", iana: "Asia/Tokyo" },
  { id: 8, label: "Singapore", iana: "Asia/Singapore" },
  { id: 9, label: "Lagos", iana: "Africa/Lagos" },
];

export function findTimezoneOption(iana: string): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find((option) => option.iana === iana);
}

export function timezoneOptionById(id: number): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find((option) => option.id === id);
}

/** Parse HH:MM or HHMM into minutes since midnight. */
export function parseClockTime(value: string): number | null {
  const normalized = value.includes(":")
    ? value
    : `${value.slice(0, 2)}:${value.slice(2, 4)}`;
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized.trim());
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function formatClockTime(hhmm: string): string {
  const minutes = parseClockTime(hhmm);
  if (minutes === null) {
    return hhmm;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${period}`;
}

export function toClockToken(hhmm: string): string {
  const minutes = parseClockTime(hhmm);
  if (minutes === null) {
    return "0000";
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}${String(mins).padStart(2, "0")}`;
}

export function fromClockToken(token: string): string | null {
  if (!/^\d{4}$/.test(token)) {
    return null;
  }
  const hhmm = `${token.slice(0, 2)}:${token.slice(2, 4)}`;
  return parseClockTime(hhmm) === null ? null : hhmm;
}

function minutesInTimezone(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number.parseInt(
      parts.find((part) => part.type === "hour")?.value ?? "",
      10,
    );
    const minute = Number.parseInt(
      parts.find((part) => part.type === "minute")?.value ?? "",
      10,
    );
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

/** True when local time falls inside the daily quiet window. */
export function isInsideQuietWindow(
  start: string,
  end: string,
  timeZone: string,
  now = new Date(),
): boolean {
  const startMinutes = parseClockTime(start);
  const endMinutes = parseClockTime(end);
  const nowMinutes = minutesInTimezone(now, timeZone);
  if (
    startMinutes === null ||
    endMinutes === null ||
    nowMinutes === null ||
    startMinutes === endMinutes
  ) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export interface QuietHoursConfig {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
}

export function quietHoursActive(
  config: QuietHoursConfig,
  now = new Date(),
): boolean {
  if (!config.quietHoursEnabled) {
    return false;
  }
  return isInsideQuietWindow(
    config.quietHoursStart,
    config.quietHoursEnd,
    config.quietHoursTimezone,
    now,
  );
}

export function describeQuietHours(config: QuietHoursConfig, now = new Date()): string {
  if (!config.quietHoursEnabled) {
    return "off";
  }

  const tz =
    findTimezoneOption(config.quietHoursTimezone)?.label ??
    config.quietHoursTimezone;
  const start = formatClockTime(config.quietHoursStart);
  const end = formatClockTime(config.quietHoursEnd);
  const active = quietHoursActive(config, now) ? "quiet now" : "alerts on now";
  return `on · ${start} to ${end} (${tz}) · ${active}`;
}
