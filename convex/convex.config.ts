import { defineApp } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(r2);
app.use(rateLimiter);

// Users aggregate
app.use(aggregate, { name: "usersAggregate" });
// Apps aggregate
app.use(aggregate, { name: "appsAggregate" });
// Matches aggregate
app.use(aggregate, { name: "matchesAggregate" });
// DAU aggregate
app.use(aggregate, { name: "dauAggregate" });

export default app;
