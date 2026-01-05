import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily analytics snapshot at midnight UTC
crons.daily(
    "snapshot-analytics",
    { hourUTC: 0, minuteUTC: 5 }, // Run at 00:05 UTC to capture previous day safely
    internal.admin.internalSnapshotDailyStats
);

// Delete messages older than 14 days every day
crons.daily(
    "cleanup-messages",
    { hourUTC: 1, minuteUTC: 0 },
    internal.matches.deleteOldMessages
);

// Check for missed day penalties daily at 12:30 AM IST (19:00 UTC)
crons.daily(
    "check-penalties",
    { hourUTC: 19, minuteUTC: 0 },
    internal.matches.checkMissedPenalties
);

// Cleanup old proof files (older than 3 days) daily at 4:30 AM UTC
crons.daily(
    "cleanup-proofs",
    { hourUTC: 4, minuteUTC: 30 },
    internal.matches.cleanupOldProofsAction
);

// Cleanup old notifications (older than 14 days) daily at 2:00 AM UTC
crons.daily(
    "cleanup-notifications",
    { hourUTC: 2, minuteUTC: 0 },
    internal.notifications.cleanupOldNotifications
);

export default crons;
