import { InlineKeyboard } from "grammy";

import type { StateStore } from "../state.js";
import { E, withEmoji } from "./emoji.js";
import {
  describeQuietHours,
  formatClockTime,
  findTimezoneOption,
  QUIET_TIME_PRESETS,
  TIMEZONE_OPTIONS,
  toClockToken,
} from "./quiet-hours.js";

export function buildQuietHoursText(state: StateStore): string {
  const snapshot = state.snapshot;
  const status = describeQuietHours(snapshot);
  const tz =
    findTimezoneOption(snapshot.quietHoursTimezone)?.label ??
    snapshot.quietHoursTimezone;

  return [
    `<b>${E.mute} Quiet hours</b>`,
    "",
    "Pause Telegram alerts during a daily window in your timezone.",
    "Messages still sync; alerts resume automatically when the window ends.",
    "",
    `Status: ${status}`,
    `Timezone: ${tz}`,
    `Quiet from: ${formatClockTime(snapshot.quietHoursStart)}`,
    `Quiet until: ${formatClockTime(snapshot.quietHoursEnd)}`,
    "",
    `<i>Pauses alerts from 6:00 PM until 9:00 AM in your timezone.</i>`,
    `<i>For a workday window instead, set Quiet from 9:00 AM and Quiet until 6:00 PM.</i>`,
  ].join("\n");
}

export function quietHoursKeyboard(state: StateStore): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (state.snapshot.quietHoursEnabled) {
    keyboard.text(withEmoji(E.unmute, "Turn off"), "quiet:off");
  } else {
    keyboard.text(withEmoji(E.mute, "Turn on"), "quiet:on");
  }
  keyboard
    .row()
    .text("Quiet from", "quiet:pick:start")
    .text("Quiet until", "quiet:pick:end");
  keyboard.row().text(withEmoji(E.status, "Timezone"), "quiet:pick:tz");
  keyboard.row().text(withEmoji(E.back, "Back to settings"), "settings:refresh");
  return keyboard;
}

export function pickQuietStartText(state: StateStore): string {
  return [
    `<b>Quiet from</b>`,
    "",
    `Current: ${formatClockTime(state.snapshot.quietHoursStart)}`,
    "Pick a start time.",
  ].join("\n");
}

export function pickQuietEndText(state: StateStore): string {
  return [
    `<b>Quiet until</b>`,
    "",
    `Current: ${formatClockTime(state.snapshot.quietHoursEnd)}`,
    "Pick an end time.",
  ].join("\n");
}

export function pickQuietTimezoneText(state: StateStore): string {
  const current =
    findTimezoneOption(state.snapshot.quietHoursTimezone)?.label ??
    state.snapshot.quietHoursTimezone;
  return [
    `<b>Timezone</b>`,
    "",
    `Current: ${current}`,
    "Pick your local timezone.",
  ].join("\n");
}

function timePresetKeyboard(prefix: "ps" | "pe"): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const preset of QUIET_TIME_PRESETS) {
    const token = toClockToken(preset);
    const label = formatClockTime(preset);
    keyboard.text(label, `quiet:${prefix}:${token}`).row();
  }
  keyboard.text(withEmoji(E.back, "Back"), "settings:quiet");
  return keyboard;
}

export function pickQuietStartKeyboard(): InlineKeyboard {
  return timePresetKeyboard("ps");
}

export function pickQuietEndKeyboard(): InlineKeyboard {
  return timePresetKeyboard("pe");
}

export function pickQuietTimezoneKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const option of TIMEZONE_OPTIONS) {
    keyboard.text(option.label, `quiet:tz:${option.id}`).row();
  }
  keyboard.text(withEmoji(E.back, "Back"), "settings:quiet");
  return keyboard;
}
