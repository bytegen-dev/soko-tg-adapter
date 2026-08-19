import type { Context } from "grammy";

/** Telegram rejects callback answers after ~10s or if already answered. */
export async function safeAnswerCallback(
  ctx: Context,
  options?: { text?: string },
): Promise<void> {
  try {
    await ctx.answerCallbackQuery(options);
  } catch {
    // Stale or duplicate callback — ignore.
  }
}
