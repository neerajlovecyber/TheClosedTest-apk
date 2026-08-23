import process from "node:process";

export const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TOKEN || "";
export const TOKEN = BOT_TOKEN;

if (!BOT_TOKEN && process.env.NODE_ENV !== "test") {
  console.warn("⚠️ BOT_TOKEN is not set in environment or .env file!");
}
