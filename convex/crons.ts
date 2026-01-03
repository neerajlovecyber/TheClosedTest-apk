import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily analytics snapshot at midnight UTC
crons.daily(
    "snapshot-analytics",
    { hourUTC: 0, minuteUTC: 5 }, // Run at 00:05 UTC to capture previous day safely
    internal.admin.internalSnapshotDailyStats
);

export default crons;
