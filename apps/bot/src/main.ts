// SPDX-License-Identifier: AGPL-3.0-only
// Runs the Meadhall bot: `MEADHALL_BOT_HOMESERVER=… MEADHALL_BOT_USER=… MEADHALL_BOT_PASSWORD=… node src/main.ts`.
import { MeadhallBot } from "./bot.ts";
import { readConfig } from "./config.ts";

const bot = new MeadhallBot(readConfig());
const shutdown = (): void => {
    void bot.stop().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
await bot.start();
