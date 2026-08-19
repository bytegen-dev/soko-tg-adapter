import { Bot } from "grammy";

import { registerCommands } from "./bot/commands.js";
import { registerCallbacks } from "./bot/callbacks.js";
import { loadConfig } from "./config.js";
import { MessagePoller } from "./poller.js";
import { SokosumiClient } from "./sokosumi/client.js";
import { StateStore } from "./state.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const state = new StateStore();
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
    console.error("[telegram] update error:", error.error ?? error);
  });

  const botInfo = await bot.api.getMe();
  console.log(
    `[bot] @${botInfo.username} listening; polling Sokosumi every ${config.POLL_INTERVAL_MS}ms`,
  );
  await bot.start();
}

main().catch((error) => {
  console.error("[bot] fatal:", error);
  process.exit(1);
});
