import { webhookCallback } from "grammy";
import { bot } from "~/src";
import { WEBHOOK_SECRET } from "~/src/env";

export default defineEventHandler((event) => {
  const handle = webhookCallback(bot, "http", {
    secretToken: WEBHOOK_SECRET,
  });
  return handle(event.node.req, event.node.res);
});
