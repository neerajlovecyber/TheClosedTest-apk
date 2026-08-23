import type { Context } from "grammy";
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
}
