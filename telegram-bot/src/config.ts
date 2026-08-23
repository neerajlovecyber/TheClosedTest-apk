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
