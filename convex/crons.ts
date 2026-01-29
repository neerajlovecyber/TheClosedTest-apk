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

// Auto-complete matches on Day 15 (after Day 14 testing is done)
// Runs at 12:35 AM IST (19:05 UTC previous day)
crons.daily(
    "auto-complete-matches",
    { hourUTC: 19, minuteUTC: 5 },
    internal.matches.autoCompleteMatches
);

// Delete old proof ROWS from database (> 20 days old from completed matches)
// Runs at 3:00 AM UTC (8:30 AM IST)
crons.daily(
    "cleanup-proof-rows",
    { hourUTC: 3, minuteUTC: 0 },
    internal.matches.cleanupOldProofRows
);

// Delete cancelled matches older than 7 days (and their proofs/messages)
// Runs at 3:30 AM UTC (9:00 AM IST)
crons.daily(
    "cleanup-cancelled-matches",
    { hourUTC: 3, minuteUTC: 30 },
    internal.matches.cleanupCancelledMatches
);

// Check for inactive app owners (pending proofs > 48h)
// Runs at 2:30 AM IST (9:00 PM UTC previous day)
crons.daily(
    "check-app-owner-inactivity",
    { hourUTC: 21, minuteUTC: 0 },
    internal.matches.checkAppOwnerInactivity
);

// Sync currentTesters cache every 4 hours (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC)
// Fixes discrepancies between marketplace and app details tester counts
crons.interval(
    "sync-tester-counts",
    { hours: 4 },
    internal.apps.internalSyncCurrentTesters
);

export default crons;
