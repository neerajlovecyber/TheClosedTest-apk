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

export default crons;
