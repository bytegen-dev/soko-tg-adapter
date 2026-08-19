import { Bot } from "grammy";

import { registerCommands } from "./bot/commands.js";
import { registerCallbacks } from "./bot/callbacks.js";
import { startTelegramPolling } from "./bot/telegram-poll.js";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";
import { MessagePoller } from "./poller.js";
import { SokosumiClient } from "./sokosumi/client.js";
import { StateStore } from "./state.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const state = new StateStore(config.STATE_DATA_DIR);
  await state.load();

  const client = new SokosumiClient(config);

  try {
    const me = await client.getMe();
    state.setSelfUserId(me.id);
    await state.save();
    console.log(`[sokosumi] authenticated as ${me.name} (${me.email})`);
  } catch (error) {
    console.error("[sokosumi] failed to load /users/me:", error);
    process.exit(1);
  }

  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  await bot.api.deleteWebhook({ drop_pending_updates: true });

  registerCommands(bot, config, client, state);
  registerCallbacks(bot, config, client, state);

  const poller = new MessagePoller(bot, config, client, state);
  poller.start();

  bot.catch((error) => {
    const err = error.error ?? error;
    console.error("[telegram] update error:", err);
  });

  const healthPort = config.PORT ?? Number(process.env.PORT ?? 8080);
  const healthServer = startHealthServer(healthPort);

  const botInfo = await bot.api.getMe();
  console.log(
    `[bot] @${botInfo.username} listening; polling Sokosumi every ${config.POLL_INTERVAL_MS}ms`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[bot] ${signal} received, shutting down`);
    poller.stop();
    healthServer.close();
    try {
      await bot.stop();
    } catch (error) {
      console.error("[bot] stop failed:", error);
    }
    try {
      await state.save();
    } catch (error) {
      console.error("[bot] state save failed:", error);
    }
    process.exit(0);
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await startTelegramPolling(bot);
}

main().catch((error) => {
  console.error("[bot] fatal:", error);
  process.exit(1);
});
