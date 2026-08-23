// Configuration for Telegram Community Moderation

// Empty list for now - you can add words here or dynamically via admin commands
export const BANNED_KEYWORDS: string[] = [];

// Empty list of restricted/allowed domains for now
export const ALLOWED_DOMAINS: string[] = [];

export const MODERATION_CONFIG = {
  autoDeleteSpam: true,
  warnUser: true,
  warningAutoDeleteSeconds: 5, // Warning message self-destructs after 5s
};

// Hardcoded topic link filters: thread ID -> link patterns to auto-delete in that topic
export const TOPIC_LINK_FILTERS: Record<number, string[]> = {
  1: ["groups.google.com"], // General
  7: ["groups.google.com"],
  8: ["groups.google.com"],
  13: ["groups.google.com"],
  5225: ["groups.google.com"],
};

// Links that are NEVER deleted, even if they match a filter (our official Google Group)
export const OFFICIAL_ALLOWED_LINKS: string[] = [
  "groups.google.com/g/developers-community-official",
];
