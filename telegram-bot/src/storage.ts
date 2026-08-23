import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// import.meta.dir only exists under Bun; derive the dir for Node runtimes (Vercel)
const here =
  typeof import.meta.dir === "string"
    ? import.meta.dir
    : path.dirname(fileURLToPath(import.meta.url));

const STATE_FILE = path.resolve(here, "../bot-state.json");

export interface BotState {
  groupId: number | string | null;
  groupTitle: string;
  bannedKeywords: string[];
  topics: Record<string, { threadId: number; name: string; isGeneral?: boolean }>;
  linkFilters: Record<string, string[]>;
  pendingLinkFilters: Record<string, string[]>;
  allowedLinks: string[];
}

export function loadBotState(): BotState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Could not load bot-state.json:", err);
  }

  return {
    groupId: process.env.GROUP_ID || process.env.TARGET_GROUP_ID || null,
    groupTitle: "Your Group",
    bannedKeywords: [],
    topics: {},
    linkFilters: {},
    pendingLinkFilters: {},
    allowedLinks: [],
  };
}

export function saveBotState(state: Partial<BotState>) {
  try {
    const current = loadBotState();
    const updated: BotState = {
      ...current,
      ...state,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save bot-state.json:", err);
  }
}
