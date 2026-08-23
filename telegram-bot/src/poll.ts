import { bot } from "./index";
import { BOT_TOKEN } from "./env";

if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is not set in your environment or .env file!");
  console.error("👉 Create a bot via https://t.me/BotFather and add BOT_TOKEN=your_token to telegram-bot/.env");
  process.exit(1);
}

async function run() {
  console.log("🚀 Starting TheClosedTest Telegram Moderation Bot in polling mode...");

  try {
    // Clear any lingering webhook on Telegram servers so polling receives all messages immediately
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log("🔄 Cleared old webhooks, listening for live messages...");
  } catch (err) {
    console.warn("⚠️ Could not clear webhook (might not be set):", err);
  }

  await bot.start({
    allowed_updates: [
      "message",
      "edited_message",
      "channel_post",
      "edited_channel_post",
      "my_chat_member",
      "chat_member",
    ],
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} is online and actively monitoring groups & DMs!`);
    },
  });
}

run().catch((err) => {
  console.error("Fatal startup error:", err);
});
