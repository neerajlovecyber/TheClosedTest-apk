import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
    checkIn: { kind: "fixed window", rate: 1, period: 2 * HOUR },
    onePerMin: { kind: "fixed window", rate: 3, period: 60 * 1000 },
});
