import { Bot } from "grammy";
import { BOT_TOKEN } from "./env";
import { activeBannedKeywords, isChatAdmin, moderateMessage } from "./moderation";
import { knownTopics, registerTopicFromContext } from "./topics";
import { loadBotState, saveBotState } from "./storage";

export const bot = new Bot(BOT_TOKEN);

const initialState = loadBotState();
export let managedGroupId: number | string | null = initialState.groupId;
export let managedGroupTitle: string = initialState.groupTitle || "Your Group";

// Diagnostic logger & auto-register group + topics
bot.use(async (ctx, next) => {
  if (ctx.chat) {
    if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
      if (managedGroupId !== ctx.chat.id || managedGroupTitle !== (ctx.chat.title || "Your Group")) {
        managedGroupId = ctx.chat.id;
        managedGroupTitle = ctx.chat.title || "Your Group";
        saveBotState({ groupId: managedGroupId, groupTitle: managedGroupTitle });
        console.log(`🔗 [LINKED GROUP] "${managedGroupTitle}" (ID: ${managedGroupId})`);
      }

      registerTopicFromContext(ctx);

      const threadId = ctx.message?.message_thread_id;
      const topicInfo = threadId ? knownTopics.get(threadId)?.name || `Topic #${threadId}` : "General";
      const sender = `@${ctx.from?.username || ctx.from?.first_name || "unknown"}`;
      const text = ctx.message?.text || ctx.message?.caption || "[attachment/service]";

      console.log(`💬 [${managedGroupTitle}] [${topicInfo} (ID: ${threadId || 1})] ${sender}: ${text}`);
    }
  }
  await next();
});

// /start command
bot.command("start", async (ctx) => {
  const isPrivate = ctx.chat?.type === "private";
  const groupLabel = managedGroupId ? `*${managedGroupTitle}* (\`${managedGroupId}\`)` : "_Not connected yet (type any message in your group or run /check inside it)_";

  await ctx.reply(
    "👋 Hello! I am the official *TheClosedTest* Community Moderation Bot.\n\n" +
      `🛡️ *Connected Group:* ${groupLabel}\n\n` +
      `${isPrivate ? "💡 _You can manage your group directly from this private chat!_\n\n" : ""}` +
      "Commands:\n" +
      "• `/addword <word>` - Add a prohibited word\n" +
      "• `/delword <word>` - Remove a prohibited word\n" +
      "• `/listwords` - View all active banned words\n" +
      "• `/topics` - List all detected topics in your group\n" +
      "• `/status` - Check bot & group connection status\n" +
      "• `/check` - Check bot admin permissions in the group",
    { parse_mode: "Markdown" },
  );
});

// /status command
bot.command("status", async (ctx) => {
  const count = activeBannedKeywords.size;
  const topicsCount = knownTopics.size;
  const groupStatus = managedGroupId
    ? `Connected to *${managedGroupTitle}* (\`${managedGroupId}\`)`
    : "⚠️ Not connected yet (send a message in your group to connect)";

  await ctx.reply(
    `🤖 *TheClosedTest Bot Status:*\n\n` +
      `• *Group:* ${groupStatus}\n` +
      `• *Banned Keywords Count:* ${count}\n` +
      `• *Detected Topics:* ${topicsCount}\n` +
      `• *Moderation:* Active ✅`,
    { parse_mode: "Markdown" },
  );
});

// /addword <word>
bot.command("addword", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const text = ctx.message?.text?.replace(/^\/addword(@\w+)?\s*/, "").trim();
  if (!text) {
    return ctx.reply("⚠️ Usage: `/addword <keyword or phrase>`", {
      parse_mode: "Markdown",
    });
  }

  const word = text.toLowerCase();
  activeBannedKeywords.add(word);
  saveBotState({ bannedKeywords: Array.from(activeBannedKeywords) });

  await ctx.reply(`✅ Added *"${word}"* to the banned keywords list.\nTotal active keywords: ${activeBannedKeywords.size}`, {
    parse_mode: "Markdown",
  });
});

// /delword <word>
bot.command("delword", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const text = ctx.message?.text?.replace(/^\/delword(@\w+)?\s*/, "").trim();
  if (!text) {
    return ctx.reply("⚠️ Usage: `/delword <keyword or phrase>`", {
      parse_mode: "Markdown",
    });
  }

  const word = text.toLowerCase();
  if (activeBannedKeywords.has(word)) {
    activeBannedKeywords.delete(word);
    saveBotState({ bannedKeywords: Array.from(activeBannedKeywords) });
    await ctx.reply(`✅ Removed *"${word}"* from the banned keywords list.`, {
      parse_mode: "Markdown",
    });
  } else {
    await ctx.reply(`⚠️ *"${word}"* was not found in the list.`, {
      parse_mode: "Markdown",
    });
  }
});

// /listwords
bot.command("listwords", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const words = Array.from(activeBannedKeywords);
  if (words.length === 0) {
    return ctx.reply("📋 No banned keywords configured yet.\nUse `/addword <word>` to add one.", { parse_mode: "Markdown" });
  }

  const formatted = words.map((w, i) => `${i + 1}. \`${w}\``).join("\n");
  await ctx.reply(`📋 *Active Banned Keywords (${words.length}):*\n\n${formatted}`, {
    parse_mode: "Markdown",
  });
});

// /topics or /channels
bot.command(["topics", "channels"], async (ctx) => {
  const list = Array.from(knownTopics.values());
  if (list.length === 0) {
    return ctx.reply(
      "📋 *No topics detected yet.*\n\nSend a message in any topic in your group so the bot can register it!",
      { parse_mode: "Markdown" },
    );
  }

  const groupTitle = managedGroupTitle || "Your Group";
  const formatted = list
    .map((t, i) => `${i + 1}. *${t.name}* (ID: \`${t.threadId}\`)${t.isGeneral ? " [General]" : ""}`)
    .join("\n");

  await ctx.reply(`📋 *Discovered Topics in "${groupTitle}":*\n\n${formatted}`, {
    parse_mode: "Markdown",
  });
});

// /check or /perms command
bot.command(["perms", "check"], async (ctx) => {
  const isPrivate = ctx.chat?.type === "private";
  const targetId = isPrivate ? managedGroupId : ctx.chat?.id;

  if (!targetId) {
    return ctx.reply(
      "⚠️ *No group connected yet.*\n\nPlease send `/check` (or any message) **inside your Telegram group** once so the bot connects to it!",
      { parse_mode: "Markdown" },
    );
  }

  try {
    const botMember = await ctx.api.getChatMember(targetId, ctx.me.id);
    const chat = await ctx.api.getChat(targetId);
    const isForum = Boolean((chat as any).is_forum);

    if (botMember.status !== "administrator") {
      return ctx.reply(
        `⚠️ *Bot Status in "${(chat as any).title || targetId}":*\n\n` +
          `• *Role:* Member (Not Admin)\n` +
          `• *Is Forum:* ${isForum ? "Yes" : "No"}\n\n` +
          `👉 Please promote the bot to *Admin* and grant *Delete Messages* & *Manage Topics* permissions.`,
        { parse_mode: "Markdown" },
      );
    }

    const perms = [
      `🗑️ *Delete Messages:* ${botMember.can_delete_messages ? "✅ YES" : "❌ NO"}`,
      `🏷️ *Manage Topics:* ${botMember.can_manage_topics ? "✅ YES" : "❌ NO"}`,
      `📌 *Pin Messages:* ${botMember.can_pin_messages ? "✅ YES" : "❌ NO"}`,
      `🚫 *Restrict Members:* ${botMember.can_restrict_members ? "✅ YES" : "❌ NO"}`,
      `💬 *Change Group Info:* ${botMember.can_change_info ? "✅ YES" : "❌ NO"}`,
      `👥 *Invite Users:* ${botMember.can_invite_users ? "✅ YES" : "❌ NO"}`,
    ];

    await ctx.reply(
      `🛡️ *Bot Permissions in "${(chat as any).title || targetId}":*\n\n` +
        `• *Role:* Administrator ✅\n` +
        `• *Is Forum Group:* ${isForum ? "✅ YES (Topics enabled)" : "ℹ️ Standard group (No topics)"}\n\n` +
        perms.join("\n"),
      { parse_mode: "Markdown" },
    );
  } catch (error: any) {
    await ctx.reply(`❌ Error checking permissions: ${error.message}`);
  }
});

// Intercept all messages and edited messages for moderation
bot.on(["message:text", "message:caption", "edited_message"], async (ctx) => {
  await moderateMessage(ctx);
});

// Global error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});
