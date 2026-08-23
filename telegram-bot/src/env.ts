import process from "node:process";

export const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TOKEN || "";
export const TOKEN = BOT_TOKEN;
// Secret for Telegram webhook headers (allowed chars: A-Za-z0-9 and _- only)
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "TheClosedTest_WebHook_Secret_x9Kq2";

if (!BOT_TOKEN && process.env.NODE_ENV !== "test") {
  console.warn("⚠️ BOT_TOKEN is not set in environment or .env file!");
}
