import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Submit a report (user, app, or conversation)
export const createReport = mutation({
    args: {
        type: v.union(
            v.literal("dispute"),
            v.literal("app_spam"),
            v.literal("toxic_user"),
            v.literal("other"),
            v.literal("app_broken"),
            v.literal("user_unresponsive")
        ),
        targetId: v.string(),
        matchId: v.optional(v.id("matches")),
        reportedUserId: v.optional(v.id("users")),
        reportedAppId: v.optional(v.id("apps")),
        description: v.string(),
        screenshots: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!user) throw new Error("User not found");

        // Create the report
        const reportId = await ctx.db.insert("reports", {
            reporterId: user._id,
            type: args.type,
            targetId: args.targetId,
            matchId: args.matchId,
            reportedUserId: args.reportedUserId,
            reportedAppId: args.reportedAppId,
            description: args.description,
            screenshots: args.screenshots,
            status: "pending",
            createdAt: Date.now(),
        });

        // TODO: Send notification to admins
        // This would be implemented when we have admin notification system

        return reportId;
    },
});

// Get full context for a report (admin only)
export const getReportDetails = query({
    args: { reportId: v.id("reports") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            throw new Error("Admin access required");
        }

        const report = await ctx.db.get(args.reportId);
        if (!report) throw new Error("Report not found");

        // Get reporter details
        const reporter = await ctx.db.get(report.reporterId);

        // Get reported user if specified
        let reportedUser = null;
        if (report.reportedUserId) {
            reportedUser = await ctx.db.get(report.reportedUserId);
        }

        // Get reported app if specified
        let reportedApp = null;
        if (report.reportedAppId) {
            reportedApp = await ctx.db.get(report.reportedAppId);

            // If app is reported but no user is explicitly reported, fetch the app owner
            if (!reportedUser && reportedApp) {
                reportedUser = await ctx.db.get(reportedApp.userId);
            }
        }

        // Get match details if it's a conversation report
        let matchDetails = null;
        if (report.matchId) {
            const match = await ctx.db.get(report.matchId);
            if (match) {
                const user1 = await ctx.db.get(match.user1Id);
                const user2 = await ctx.db.get(match.user2Id);
                const app1 = await ctx.db.get(match.app1Id);
                const app2 = await ctx.db.get(match.app2Id);

                // Get conversation messages
                const messages = await ctx.db
                    .query("messages")
                    .withIndex("by_matchId", (q) => q.eq("matchId", report.matchId!))
                    .collect();

                matchDetails = {
                    match,
                    user1,
                    user2,
                    app1,
                    app2,
                    messages,
                };
            }
        }

        // Get warnings/bans for reported user
        let userHistory = null;
        if (reportedUser) {
            const warnings = await ctx.db
                .query("user_warnings")
                .withIndex("by_userId", (q) => q.eq("userId", reportedUser!._id))
                .collect();

            const bans = await ctx.db
                .query("user_bans")
                .withIndex("by_userId", (q) => q.eq("userId", reportedUser!._id))
                .collect();

            userHistory = { warnings, bans };
        }

        return {
            report,
            reporter,
            reportedUser,
            reportedApp,
            matchDetails,
            userHistory,
        };
    },
});

// List reports with filters (admin only)
export const listReports = query({
    args: {
        status: v.optional(v.union(
            v.literal("pending"),
            v.literal("resolved"),
            v.literal("dismissed")
        )),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) {
            return [];
        }

        // Get all reports and filter/sort in memory for simplicity
        const allReports = await ctx.db.query("reports").collect();

        const filteredReports = args.status
            ? allReports.filter((r) => r.status === args.status)
            : allReports;

        const reports = filteredReports
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50);

        // Enrich with reporter names
        const enrichedReports = await Promise.all(
            reports.map(async (report) => {
                const reporter = await ctx.db.get(report.reporterId);
                let reportedUserName = null;
                let reportedAppTitle = null;

                if (report.reportedUserId) {
                    const user = await ctx.db.get(report.reportedUserId);
                    reportedUserName = user?.name || "Unknown";
                }

                if (report.reportedAppId) {
                    const app = await ctx.db.get(report.reportedAppId);
                    reportedAppTitle = app?.title || "Unknown";
                }

                return {
                    ...report,
                    reporterName: reporter?.name || "Unknown",
                    reportedUserName,
                    reportedAppTitle,
                };
            })
        );

        return enrichedReports;
    },
});

// Get report stats for admin dashboard
export const getReportStats = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) return null;

        const allReports = await ctx.db.query("reports").collect();

        return {
            pending: allReports.filter((r) => r.status === "pending").length,
            resolved: allReports.filter((r) => r.status === "resolved").length,
            dismissed: allReports.filter((r) => r.status === "dismissed").length,
            total: allReports.length,
        };
    },
});

// Get recent reports for dashboard
export const getRecentReports = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) return [];

        const reports = await ctx.db
            .query("reports")
            .withIndex("by_status", (q) => q.eq("status", "pending"))
            .order("desc")
            .take(5);

        return reports;
    },
});

// Get count of pending reports (for Admin tab badge)
export const getPendingCount = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return 0;

        const admin = await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (!admin || !admin.isAdmin) return 0;

        const pending = await ctx.db
            .query("reports")
            .withIndex("by_status", (q) => q.eq("status", "pending"))
            .collect();

        return pending.length;
    },
});
