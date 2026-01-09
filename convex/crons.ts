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

// Gentle reminder to upload screenshot - 6 PM IST (12:30 PM UTC)
crons.daily(
    "gentle-upload-reminder",
    { hourUTC: 12, minuteUTC: 30 },
    internal.notificationHelper.sendGentleReminders
);

// Urgent reminder to upload screenshot - 10 PM IST (4:30 PM UTC)
// Warning: Upload before midnight or lose reputation!
crons.daily(
    "urgent-upload-reminder",
    { hourUTC: 16, minuteUTC: 30 },
    internal.notificationHelper.sendUrgentReminders
);

export default crons;
