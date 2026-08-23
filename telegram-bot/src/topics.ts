import type { Context } from "grammy";
import { OFFICIAL_ALLOWED_LINKS, TOPIC_LINK_FILTERS } from "./config";
import { loadBotState, saveBotState } from "./storage";

export interface ForumTopicData {
  threadId: number;
  name: string;
  isGeneral?: boolean;
  lastActiveAt: Date;
}

const initialState = loadBotState();

// In-memory registry of discovered topics for this group
export const knownTopics = new Map<number, ForumTopicData>();

// Per-topic link filters: messages in these topics containing a filtered link are auto-deleted
export const topicLinkFilters = new Map<number, Set<string>>(
  Object.entries(initialState.linkFilters || {}).map(([id, links]) => [Number(id), new Set(links)])
);

// Filters saved for topics that haven't been discovered yet (keyed by lowercase name)
export const pendingNameFilters = new Map<string, Set<string>>(
  Object.entries(initialState.pendingLinkFilters || {}).map(([k, links]) => [k, new Set(links)])
);

// Links that are always allowed, even if they match a filter (e.g. our official Google Group)
export const allowedLinks = new Set<string>(
  (initialState.allowedLinks || []).map((l) => normalizeLink(l)).filter(Boolean)
);

// Hardcoded defaults from config.ts are merged in so they survive fresh deployments
for (const [idStr, links] of Object.entries(TOPIC_LINK_FILTERS)) {
  const id = Number(idStr);
  const set = topicLinkFilters.get(id) ?? new Set<string>();
  links.forEach((l) => set.add(normalizeLink(l)));
  topicLinkFilters.set(id, set);
}
OFFICIAL_ALLOWED_LINKS.forEach((l) => allowedLinks.add(normalizeLink(l)));

/**
 * Resolve a topic by thread ID or exact name
 */
export function resolveTopic(query: string): ForumTopicData | undefined {
  const asNum = Number(query);
  if (!Number.isNaN(asNum) && knownTopics.has(asNum)) {
    return knownTopics.get(asNum);
  }
  const q = query.toLowerCase().trim();
  return Array.from(knownTopics.values()).find((t) => t.name.toLowerCase() === q);
}

export function getLinkFilters(threadId: number): Set<string> {
  let filters = topicLinkFilters.get(threadId);
  if (!filters) {
    filters = new Set();
    topicLinkFilters.set(threadId, filters);
  }
  return filters;
}

/**
 * Normalize a link for matching: lowercase, strip protocol/www, strip trailing slash
 */
export function normalizeLink(link: string): string {
  return link
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function persistLinkFilters() {
  const obj: Record<string, string[]> = {};
  topicLinkFilters.forEach((links, id) => {
    if (links.size > 0) obj[String(id)] = Array.from(links);
  });
  saveBotState({ linkFilters: obj });
}

export function persistPendingFilters() {
  const obj: Record<string, string[]> = {};
  pendingNameFilters.forEach((links, name) => {
    if (links.size > 0) obj[name] = Array.from(links);
  });
  saveBotState({ pendingLinkFilters: obj });
}

export function persistAllowedLinks() {
  saveBotState({ allowedLinks: Array.from(allowedLinks) });
}

/**
 * When a topic becomes known, activate any filters that were added by name beforehand
 */
export function attachPendingFilters(topic: ForumTopicData) {
  const key = topic.name.toLowerCase();
  const pending = pendingNameFilters.get(key);
  if (!pending || pending.size === 0) return;

  const target = getLinkFilters(topic.threadId);
  pending.forEach((link) => target.add(link));
  pendingNameFilters.delete(key);
  persistLinkFilters();
  persistPendingFilters();
  console.log(`🔗 [LINK FILTER] Activated ${pending.size} pre-added filter(s) for discovered topic "${topic.name}"`);
}

// Populate from saved state
if (initialState.topics) {
  Object.entries(initialState.topics).forEach(([key, val]) => {
    knownTopics.set(Number(key), {
      threadId: val.threadId,
      name: val.name,
      isGeneral: val.isGeneral,
      lastActiveAt: new Date(),
    });
  });
}

function persistTopics() {
  const obj: Record<string, { threadId: number; name: string; isGeneral?: boolean }> = {};
  knownTopics.forEach((val, key) => {
    obj[String(key)] = {
      threadId: val.threadId,
      name: val.name,
      isGeneral: val.isGeneral,
    };
  });
  saveBotState({ topics: obj });
}

/**
 * Automatically tracks and saves topic metadata whenever an event happens in a topic
 */
export function registerTopicFromContext(ctx: Context) {
  if (!ctx.chat || (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group")) {
    return;
  }

  const threadId = ctx.message?.message_thread_id;

  // Topic creation event
  if (ctx.message?.forum_topic_created) {
    const name = ctx.message.forum_topic_created.name;
    const id = threadId || ctx.message.message_id;
    knownTopics.set(id, {
      threadId: id,
      name,
      lastActiveAt: new Date(),
    });
    persistTopics();
    attachPendingFilters(knownTopics.get(id)!);
    console.log(`🆕 [TOPIC CREATED] Name: "${name}" | Thread ID: ${id}`);
    return;
  }

  // Topic rename event
  if (ctx.message?.forum_topic_edited) {
    const name = ctx.message.forum_topic_edited.name || "Topic";
    const id = threadId || ctx.message.message_id;
    const existing = knownTopics.get(id);
    knownTopics.set(id, {
      threadId: id,
      name: name || existing?.name || `Topic #${id}`,
      lastActiveAt: new Date(),
    });
    persistTopics();
    console.log(`✏️ [TOPIC RENAMED] ID: ${id} -> New Name: "${name}"`);
    return;
  }

  // Regular message in a topic
  if (threadId) {
    const existing = knownTopics.get(threadId);
    if (!existing) {
      // Try to determine name or default to Thread #ID
      knownTopics.set(threadId, {
        threadId,
        name: `Topic #${threadId}`,
        lastActiveAt: new Date(),
      });
      persistTopics();
      console.log(`📌 [TOPIC DISCOVERED] ID: ${threadId}`);
    } else {
      existing.lastActiveAt = new Date();
    }
  } else {
    // General topic (threadId undefined / 1)
    if (!knownTopics.has(1)) {
      knownTopics.set(1, {
        threadId: 1,
        name: "General",
        isGeneral: true,
        lastActiveAt: new Date(),
      });
      persistTopics();
    }
  }

  // Activate any pre-added name-based filters for this topic
  if (threadId) {
    const t = knownTopics.get(threadId);
    if (t && !t.isGeneral) attachPendingFilters(t);
  } else if (knownTopics.has(1)) {
    attachPendingFilters(knownTopics.get(1)!);
  }
}
