import { internalMutation } from "./_generated/server";
import { usersAggregate, appsAggregate, matchesAggregate, dauAggregate } from "./aggregates";

export const backfillAggregates = internalMutation({
    args: {},
    handler: async (ctx) => {
        // 1. Backfill Users
        await usersAggregate.clear(ctx);
        const users = await ctx.db.query("users").collect();
        for (const user of users) {
            await usersAggregate.insert(ctx, user);
        }

        // 2. Backfill Apps
        await appsAggregate.clear(ctx);
        const apps = await ctx.db.query("apps").collect();
        for (const app of apps) {
            await appsAggregate.insert(ctx, app);
        }

        // 3. Backfill Matches
        await matchesAggregate.clear(ctx);
        const matches = await ctx.db.query("matches").collect();
        for (const match of matches) {
            await matchesAggregate.insert(ctx, match);
        }

        // 4. Backfill DAU
        await dauAggregate.clear(ctx);
        const dailyActivity = await ctx.db.query("daily_activity").collect();
        for (const activity of dailyActivity) {
            await dauAggregate.insert(ctx, activity);
        }
    },
});
