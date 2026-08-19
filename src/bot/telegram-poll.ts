import { Bot, GrammyError } from "grammy";

const POLL_CONFLICT_RETRY_MS = 10_000;

export function isTelegramPollingConflict(error: unknown): boolean {
  return (
    error instanceof GrammyError &&
    error.error_code === 409 &&
    error.description.includes("getUpdates")
  );
}

/**
 * Long-poll Telegram; retry on 409 when another process uses the same token.
 * (e.g. whatsapp-tg-adapter running with an identical TELEGRAM_BOT_TOKEN.)
 */
export async function startTelegramPolling(bot: Bot): Promise<void> {
  for (;;) {
    try {
      await bot.start();
      return;
    } catch (error) {
      if (!isTelegramPollingConflict(error)) {
        throw error;
      }

      console.error(
        "[telegram] 409 conflict — another process is polling this bot token.",
        "Stop the other adapter or give each project its own BotFather token.",
        `Retrying in ${POLL_CONFLICT_RETRY_MS / 1000}s...`,
      );

      try {
        await bot.stop();
      } catch {
        // Bot may not have fully started.
      }

      await new Promise((resolve) => {
        setTimeout(resolve, POLL_CONFLICT_RETRY_MS);
      });
    }
  }
}
