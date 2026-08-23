import type { Context } from "grammy";
import { MODERATION_CONFIG } from "./config";
import { loadBotState } from "./storage";

const initialState = loadBotState();

// In-memory active banned keywords set (persisted across restarts)
export const activeBannedKeywords = new Set<string>(
  initialState.bannedKeywords.map((w) => w.toLowerCase().trim()).filter(Boolean)
);

/**
 * Check if the sender of a context is an administrator or creator in the chat
 */
export async function isChatAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || ctx.chat.type === "private") return true;
  if (!ctx.from) return false;

  try {
    const member = await ctx.getChatMember(ctx.from.id);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

/**
 * Core moderation logic to scan and delete messages containing banned keywords
 */
export async function moderateMessage(ctx: Context) {
  // Only moderate group and supergroup messages
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
    return;
  }

  // Skip messages from admins/owners
  const isAdmin = await isChatAdmin(ctx);
  if (isAdmin) return;

  // Extract text from regular messages or photo/video/document captions
  const messageText = ctx.message?.text || ctx.message?.caption || "";
  if (!messageText || activeBannedKeywords.size === 0) return;

  const normalizedText = messageText.toLowerCase();

  // Check if any banned keyword is present in the text
  let matchedKeyword: string | null = null;
  for (const keyword of activeBannedKeywords) {
    if (normalizedText.includes(keyword)) {
      matchedKeyword = keyword;
      break;
    }
  }

  if (!matchedKeyword) return;

  try {
    // 1. Delete the offending message
    if (MODERATION_CONFIG.autoDeleteSpam) {
      await ctx.deleteMessage();
    }

    // 2. Send temporary self-destructing warning
    if (MODERATION_CONFIG.warnUser) {
      const userName = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || "User";

      const warning = await ctx.reply(`⚠️ ${userName}, your message was removed because it contained a restricted keyword.`, {
        reply_to_message_id: undefined,
      });

      // Auto-delete the warning message after configured seconds to keep chat clean
      const durationMs = (MODERATION_CONFIG.warningAutoDeleteSeconds || 5) * 1000;
      setTimeout(() => {
        ctx.api.deleteMessage(ctx.chat!.id, warning.message_id).catch(() => {});
      }, durationMs);
    }
  } catch (error) {
    console.error("Moderation error:", error);
  }
}
