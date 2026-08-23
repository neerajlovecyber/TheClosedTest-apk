import { Bot } from "grammy";
import { BOT_TOKEN } from "./env";
import { MODERATION_CONFIG } from "./config";
import { activeBannedKeywords, isChatAdmin, moderateMessage } from "./moderation";
import {
  allowedLinks,
  knownTopics,
  normalizeLink,
  pendingNameFilters,
  persistAllowedLinks,
  persistLinkFilters,
  persistPendingFilters,
  registerTopicFromContext,
  resolveTopic,
  getLinkFilters,
  topicLinkFilters,
} from "./topics";
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

// Topic link filters: auto-delete messages containing filtered links in filtered topics
bot.on(["message", "edited_message"], async (ctx, next) => {
  const msg = ctx.message ?? ctx.editedMessage;
  const chat = ctx.chat;

  if (!msg || !chat || (chat.type !== "group" && chat.type !== "supergroup")) {
    return next();
  }

  const threadId = msg.message_thread_id;
  if (!threadId || !topicLinkFilters.has(threadId)) {
    return next();
  }

  const filters = topicLinkFilters.get(threadId)!;
  if (filters.size === 0) {
    return next();
  }

  // Never delete the bot's own messages
  if (ctx.from?.id === ctx.me.id) {
    return next();
  }

  // Collect all text content: text, caption, and link entities
  const textParts = [msg.text || "", msg.caption || ""];
  for (const entity of [...(msg.entities || []), ...(msg.caption_entities || [])]) {
    if (entity.type === "url" || entity.type === "text_link") {
      if (entity.type === "url") {
        textParts.push(msg.text?.substring(entity.offset, entity.offset + entity.length) || "");
      } else if (entity.type === "text_link") {
        textParts.push(entity.url);
      }
    }
  }
  const normalizedText = normalizeLink(textParts.join(" "));

  let matchedFilter: string | null = null;
  for (const filter of filters) {
    if (normalizedText.includes(filter)) {
      matchedFilter = filter;
      break;
    }
  }

  if (!matchedFilter) {
    return next();
  }

  // Allowlisted links (e.g. our official Google Group) are never deleted
  for (const allowed of allowedLinks) {
    if (normalizedText.includes(allowed)) {
      return next();
    }
  }

  const topicName = knownTopics.get(threadId)?.name || `Topic #${threadId}`;
  const sender = `@${ctx.from?.username || ctx.from?.first_name || "unknown"}`;

  try {
    await ctx.api.deleteMessage(chat.id, msg.message_id);
    console.log(`🔗 [LINK FILTER] Deleted ${ctx.editedMessage ? "edit in" : "message in"} "${topicName}" from ${sender} (matched: "${matchedFilter}")`);

    // Temporary warning that self-destructs to keep the topic clean
    if (MODERATION_CONFIG.warnUser) {
      const warning = await ctx.api.sendMessage(
        chat.id,
        `⚠️ ${sender}, your message in *${topicName}* was removed because it contains an external Google Group link. Only our official group is allowed.`,
        { message_thread_id: threadId, parse_mode: "Markdown" },
      );
      const durationMs = (MODERATION_CONFIG.warningAutoDeleteSeconds || 5) * 1000;
      setTimeout(() => {
        ctx.api.deleteMessage(chat.id, warning.message_id).catch(() => {});
      }, durationMs);
    }
  } catch (error: any) {
    console.error(`Failed to delete filtered-link message in "${topicName}":`, error.message);
  }
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
      "• `/addlink <topic> <link>` - Auto-delete messages with this link in a topic\n" +
      "• `/dellink <topic> <link>` - Remove a topic link filter\n" +
      "• `/listlinks` - View all topic link filters\n" +
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

// /addlink <topic> <link> - auto-delete messages containing this link in that topic
bot.command("addlink", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const args = ctx.message?.text?.replace(/^\/addlink(@\w+)?\s*/, "").trim().split(/\s+/);
  if (!args || args.length < 2) {
    return ctx.reply("⚠️ Usage: `/addlink <topic ID or name> <link>`", { parse_mode: "Markdown" });
  }

  const [topicQuery, ...linkParts] = args;
  const link = normalizeLink(linkParts.join(""));
  const topic = resolveTopic(topicQuery);

  if (!topic) {
    // Topic not discovered yet: save filter by name, activates automatically later
    if (topicQuery.toLowerCase() === "general" || !Number.isNaN(Number(topicQuery))) {
      return ctx.reply(
        `⚠️ Topic *${topicQuery}* not found. Use /topics to see discovered topics.`,
        { parse_mode: "Markdown" },
      );
    }
    const key = topicQuery.toLowerCase();
    let pending = pendingNameFilters.get(key);
    if (!pending) {
      pending = new Set();
      pendingNameFilters.set(key, pending);
    }
    pending.add(link);
    persistPendingFilters();
    return ctx.reply(
      `⏳ Topic *${topicQuery}* hasn't been seen yet — filter for *"${link}"* saved and will activate automatically as soon as that topic appears.`,
      { parse_mode: "Markdown" },
    );
  }

  getLinkFilters(topic.threadId).add(link);
  persistLinkFilters();

  await ctx.reply(
    `✅ Messages containing *"${link}"* in topic *${topic.name}* will now be auto-deleted.`,
    { parse_mode: "Markdown" },
  );
});

// /dellink <topic> <link>
bot.command("dellink", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const args = ctx.message?.text?.replace(/^\/dellink(@\w+)?\s*/, "").trim().split(/\s+/);
  if (!args || args.length < 2) {
    return ctx.reply("⚠️ Usage: `/dellink <topic ID or name> <link>`", { parse_mode: "Markdown" });
  }

  const [topicQuery, ...linkParts] = args;
  const topic = resolveTopic(topicQuery);
  if (!topic) {
    return ctx.reply(`⚠️ Topic *${topicQuery}* not found.`, { parse_mode: "Markdown" });
  }

  const link = normalizeLink(linkParts.join(""));
  const filters = getLinkFilters(topic.threadId);
  if (filters.delete(link)) {
    persistLinkFilters();
    await ctx.reply(`✅ Removed *"${link}"* from filters for topic *${topic.name}*.`, {
      parse_mode: "Markdown",
    });
  } else {
    await ctx.reply(`⚠️ *"${link}"* is not filtered in topic *${topic.name}*.`, {
      parse_mode: "Markdown",
    });
  }
});

// /listlinks - view all topic link filters
bot.command(["listlinks", "filters"], async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  if (topicLinkFilters.size === 0 && pendingNameFilters.size === 0) {
    return ctx.reply("📋 No link filters configured yet.\nUse `/addlink <topic> <link>` to add one.", {
      parse_mode: "Markdown",
    });
  }

  const lines: string[] = [];
  topicLinkFilters.forEach((links, threadId) => {
    if (links.size === 0) return;
    const name = knownTopics.get(threadId)?.name || `Topic #${threadId}`;
    lines.push(`*${name}* (ID: \`${threadId}\`):\n${Array.from(links).map((l) => `  • \`${l}\``).join("\n")}`);
  });
  pendingNameFilters.forEach((links, name) => {
    if (links.size === 0) return;
    lines.push(`⏳ *${name}* (not discovered yet):\n${Array.from(links).map((l) => `  • \`${l}\``).join("\n")}`);
  });

  await ctx.reply(`🔗 *Active Topic Link Filters:*\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
});

// /allowlink <link> - never delete this link even if it matches a filter
bot.command("allowlink", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const link = normalizeLink(ctx.message?.text?.replace(/^\/allowlink(@\w+)?\s*/, "") || "");
  if (!link) {
    return ctx.reply("⚠️ Usage: `/allowlink <link>`", { parse_mode: "Markdown" });
  }

  allowedLinks.add(link);
  persistAllowedLinks();
  await ctx.reply(`✅ *"${link}"* is now allowed everywhere and will never be deleted.`, {
    parse_mode: "Markdown",
  });
});

// /unallowlink <link>
bot.command("unallowlink", async (ctx) => {
  const isAdmin = await isChatAdmin(ctx);
  if (!isAdmin) {
    return ctx.reply("❌ Only administrators can use this command.");
  }

  const link = normalizeLink(ctx.message?.text?.replace(/^\/unallowlink(@\w+)?\s*/, "") || "");
  if (allowedLinks.delete(link)) {
    persistAllowedLinks();
    await ctx.reply(`✅ Removed *"${link}"* from the allowed links list.`, { parse_mode: "Markdown" });
  } else {
    await ctx.reply(`⚠️ *"${link}"* was not in the allowed links list.`, { parse_mode: "Markdown" });
  }
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
