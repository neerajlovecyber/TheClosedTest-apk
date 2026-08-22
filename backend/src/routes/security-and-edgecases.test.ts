import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"

import app from "../app"
import { db } from "../db"
import { apps, matches, notifications, proofs, userBans, users } from "../db/schema"
import {
  runDailyStreakMaintenance,
  runDailyTestingReminders,
  runExpiredBansCleanup,
  runMatchProgressionAndCleanup,
  runNotificationCleanup,
  runOldMatchesCleanup,
} from "../jobs/cron-runner"

describe("Security, Edge Cases & Extended Business Logic Suite", () => {
  const normalUser1Token = `test-clerk-${crypto.randomUUID()}`
  const normalUser2Token = `test-clerk-${crypto.randomUUID()}`
  const adminUserToken = `test-clerk-${crypto.randomUUID()}`

  let user1Id = ""
  let user2Id = ""
  let adminId = ""
  let app1Id = ""
  let app2Id = ""
  let matchId = ""
  let proofId = ""

  // -------------------------------------------------------------------------
  // 1. Setup Accounts (User 1, User 2, Admin User)
  // -------------------------------------------------------------------------
  it("0. Setup test accounts and admin role", async () => {
    // Create Normal User 1
    const res1 = await app.request("/api/users/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIdentifier: normalUser1Token,
        name: "Normal User 1",
        email: `user1-${Date.now()}@test.com`,
      }),
    })
    const u1 = await res1.json()
    user1Id = u1.id

    // Create Normal User 2
    const res2 = await app.request("/api/users/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIdentifier: normalUser2Token,
        name: "Normal User 2",
        email: `user2-${Date.now()}@test.com`,
      }),
    })
    const u2 = await res2.json()
    user2Id = u2.id

    // Create Admin User (using configured admin email in constants.ts)
    const resAdmin = await app.request("/api/users/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminUserToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIdentifier: adminUserToken,
        name: "System Admin",
        email: "neerajlovecyber@gmail.com",
      }),
    })
    const adminU = await resAdmin.json()
    adminId = adminU.id

    // Create App 1 for User 1
    const appRes1 = await app.request("/api/apps", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "User 1 App",
        packageName: "com.user1.app",
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.user1.app",
        iconUrl: "https://cdn.theclosedtest.com/icons/app1.png",
        instructions: "Please test all the main dashboard buttons and features.",
      }),
    })
    expect([200, 201]).toContain(appRes1.status)
    const a1 = await appRes1.json()
    app1Id = a1.id

    // Create App 2 for User 2
    const appRes2 = await app.request("/api/apps", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "User 2 App",
        packageName: "com.user2.app",
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.user2.app",
        iconUrl: "https://cdn.theclosedtest.com/icons/app2.png",
        instructions: "Please test the complete onboarding and signup flow.",
      }),
    })
    expect([200, 201]).toContain(appRes2.status)
    const a2 = await appRes2.json()
    app2Id = a2.id
  })

  // -------------------------------------------------------------------------
  // 2. Authentication & Unauthorized Checks (401)
  // -------------------------------------------------------------------------
  it("1. GET /api/users/me without Authorization header returns 401", async () => {
    const res = await app.request("/api/users/me")
    expect(res.status).toBe(401)
  })

  it("2. POST /api/apps without Authorization header returns 401", async () => {
    const res = await app.request("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Spam App",
        packageName: "com.spam",
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.spam",
        iconUrl: "https://cdn.theclosedtest.com/icons/spam.png",
        instructions: "Testing spam",
      }),
    })
    expect(res.status).toBe(401)
  })

  it("3. POST /api/matches/request without token returns 401", async () => {
    const res = await app.request("/api/matches/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myAppId: app1Id, targetAppId: app2Id }),
    })
    expect(res.status).toBe(401)
  })

  // -------------------------------------------------------------------------
  // 3. Authorization & RBAC Checks (403)
  // -------------------------------------------------------------------------
  it("4. Non-admin user accessing GET /api/admin/stats returns 403 Forbidden", async () => {
    const res = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${normalUser1Token}` },
    })
    expect(res.status).toBe(403)
  })

  it("5. Admin user accessing GET /api/admin/stats returns 200 with metrics", async () => {
    const res = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${adminUserToken}` },
    })
    expect(res.status).toBe(200)
    const stats = await res.json()
    expect(stats.totalUsers).toBeGreaterThanOrEqual(2)
    expect(stats.totalApps).toBeGreaterThanOrEqual(2)
  })

  it("6. User 1 cannot modify User 2's app (PATCH /api/apps/:id)", async () => {
    const res = await app.request(`/api/apps/${app2Id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hacked Title" }),
    })
    expect([403, 404]).toContain(res.status)
  })

  it("7. User 1 cannot delete User 2's app (DELETE /api/apps/:id)", async () => {
    const res = await app.request(`/api/apps/${app2Id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${normalUser1Token}` },
    })
    expect([403, 404]).toContain(res.status)
  })

  // -------------------------------------------------------------------------
  // 4. Match Validation & Constraints
  // -------------------------------------------------------------------------
  it("8. User cannot request a match with their own app", async () => {
    const res = await app.request("/api/matches/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ myAppId: app1Id, targetAppId: app1Id }),
    })
    expect(res.status).toBe(400)
    const err = await res.json()
    expect(err.message).toContain("own app")
  })

  it("9. User cannot request a match with a non-existent app", async () => {
    const res = await app.request("/api/matches/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ myAppId: app1Id, targetAppId: "00000000-0000-0000-0000-000000000000" }),
    })
    expect(res.status).toBe(400)
  })

  it("10. Creates a valid match and rejects duplicate match request", async () => {
    // 1st request succeeds
    const res1 = await app.request("/api/matches/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ myAppId: app1Id, targetAppId: app2Id }),
    })
    expect(res1.status).toBe(201)
    const match = await res1.json()
    matchId = match.id

    // Duplicate request fails
    const res2 = await app.request("/api/matches/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ myAppId: app1Id, targetAppId: app2Id }),
    })
    expect(res2.status).toBe(400)
  })

  it("11. Initiator (User 1) cannot accept their own match request (only target User 2 can)", async () => {
    const res = await app.request(`/api/matches/${matchId}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}` },
    })
    expect(res.status).toBe(403)
  })

  it("12. Target User (User 2) accepts match successfully", async () => {
    const res = await app.request(`/api/matches/${matchId}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}` },
    })
    expect(res.status).toBe(200)
    const match = await res.json()
    expect(match.status).toBe("active")
  })

  // -------------------------------------------------------------------------
  // 5. Proof Upload & Review Rules
  // -------------------------------------------------------------------------
  it("13. User 1 submits Day 1 proof", async () => {
    const res = await app.request("/api/proofs", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        day: 1,
        type: "image",
        storageUrls: ["https://cdn.theclosedtest.com/proofs/test1.webp"],
        comment: "Day 1 testing done",
      }),
    })
    expect(res.status).toBe(201)
    const proof = await res.json()
    proofId = proof.id
  })

  it("14. User 1 cannot approve/review their own submitted proof", async () => {
    const res = await app.request(`/api/proofs/${proofId}/review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    })
    expect([400, 403]).toContain(res.status)
  })

  it("15. User 2 can reject proof with feedback reason", async () => {
    const res = await app.request(`/api/proofs/${proofId}/review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected", rejectionReason: "Screenshot is blurry, please re-upload" }),
    })
    expect(res.status).toBe(200)
    const reviewed = await res.json()
    expect(reviewed.status).toBe("rejected")
    expect(reviewed.rejectionReason).toBe("Screenshot is blurry, please re-upload")
  })

  // -------------------------------------------------------------------------
  // 6. User Profile, Push Token & App Upvoting
  // -------------------------------------------------------------------------
  it("16. PATCH /api/users/push-token updates Expo push token", async () => {
    const res = await app.request("/api/users/push-token", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pushToken: "ExponentPushToken[mock-token-123]" }),
    })
    expect(res.status).toBe(200)
  })

  it("17. PATCH /api/users/group-confirm confirms Google Group membership", async () => {
    const res = await app.request("/api/users/group-confirm", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${normalUser1Token}` },
    })
    expect(res.status).toBe(200)
  })

  it("18. POST /api/apps/:id/vote casts upvote on an app", async () => {
    const res = await app.request(`/api/apps/${app1Id}/vote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "positive" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.message).toContain("Vote recorded")
  })

  // -------------------------------------------------------------------------
  // 7. Support & Reports Workflow
  // -------------------------------------------------------------------------
  it("19. POST /api/reports creates user dispute ticket", async () => {
    const res = await app.request("/api/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dispute",
        targetId: user2Id,
        matchId,
        description: "Partner rejected valid proof without legitimate reason",
        screenshots: ["https://cdn.theclosedtest.com/reports/proof.webp"],
      }),
    })
    expect(res.status).toBe(201)
    const report = await res.json()
    expect(report.status).toBe("pending")
    expect(report.type).toBe("dispute")
  })

  it("20. Admin can fetch all moderation reports via GET /api/admin/reports", async () => {
    const res = await app.request("/api/admin/reports", {
      headers: { Authorization: `Bearer ${adminUserToken}` },
    })
    expect(res.status).toBe(200)
    const reports = await res.json()
    expect(reports.length).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // 8. Notifications & Match Cancellation
  // -------------------------------------------------------------------------
  it("21. POST /api/notifications/read-all marks notifications as read", async () => {
    const res = await app.request("/api/notifications/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser2Token}` },
    })
    expect(res.status).toBe(200)
  })

  it("22. POST /api/matches/:id/reject cancels active match", async () => {
    const res = await app.request(`/api/matches/${matchId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalUser1Token}` },
    })
    expect(res.status).toBe(200)
    const match = await res.json()
    expect(match.status).toBe("cancelled")
  })

  // -------------------------------------------------------------------------
  // 9. Background Cron Job Mechanics
  // -------------------------------------------------------------------------
  it("23. runDailyStreakMaintenance executes cleanly", async () => {
    let err = null
    try {
      await runDailyStreakMaintenance()
    } catch (e) {
      err = e
    }
    expect(err).toBeNull()
  })

  it("24. runMatchProgressionAndCleanup executes cleanly", async () => {
    let err = null
    try {
      await runMatchProgressionAndCleanup()
    } catch (e) {
      err = e
    }
    expect(err).toBeNull()
  })

  it("25. runNotificationCleanup executes cleanly", async () => {
    let err = null
    try {
      await runNotificationCleanup()
    } catch (e) {
      err = e
    }
    expect(err).toBeNull()
  })

  it("26. Match active for only 1 day with no proofs is NOT cancelled or penalized by cron", async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Create a 1-day old active match with NO proofs
    const [recentMatch] = await db
      .insert(matches)
      .values({
        app1Id,
        app2Id,
        user1Id,
        user2Id,
        status: "active",
        startDate: oneDayAgo,
      })
      .returning()

    const u2Before = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user2Id) })
    const initialRep = u2Before?.reputation ?? 100

    // Run cron
    await runMatchProgressionAndCleanup()

    // Verify match is still ACTIVE and reputation is unchanged
    const matchCheck = await db.query.matches.findFirst({ where: (m, { eq }) => eq(m.id, recentMatch.id) })
    expect(matchCheck?.status).toBe("active")

    const u2After = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user2Id) })
    expect(u2After?.reputation).toBe(initialRep)

    // Cleanup test match
    await db.delete(matches).where(eq(matches.id, recentMatch.id))
  })

  it("27. Match active for 4 days with user2 inactive IS cancelled and user2 is penalized -10", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Create a 4-day old active match
    const [abandonedMatch] = await db
      .insert(matches)
      .values({
        app1Id,
        app2Id,
        user1Id,
        user2Id,
        status: "active",
        startDate: fourDaysAgo,
      })
      .returning()

    // User 1 submitted a proof 1 day ago (active)
    await db.insert(proofs).values({
      matchId: abandonedMatch.id,
      uploaderId: user1Id,
      day: 1,
      type: "image",
      storageUrls: ["https://example.com/p1.png"],
      status: "approved",
      submittedAt: oneDayAgo,
    })

    // User 2 never submitted or last proof was 4 days ago (inactive)
    const u1Before = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user1Id) })
    const u2Before = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user2Id) })
    const u1Rep = u1Before?.reputation ?? 100
    const u2Rep = u2Before?.reputation ?? 100

    // Run cron
    await runMatchProgressionAndCleanup()

    // Verify match was cancelled
    const matchCheck = await db.query.matches.findFirst({ where: (m, { eq }) => eq(m.id, abandonedMatch.id) })
    expect(matchCheck?.status).toBe("cancelled")

    // Verify user1 was NOT penalized, user2 was penalized -10
    const u1After = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user1Id) })
    const u2After = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user2Id) })
    expect(u1After?.reputation).toBe(u1Rep)
    expect(u2After?.reputation).toBe(Math.max(0, u2Rep - 10))

    // Cleanup
    await db.delete(proofs).where(eq(proofs.matchId, abandonedMatch.id))
    await db.delete(matches).where(eq(matches.id, abandonedMatch.id))
  })

  it("28. runNotificationCleanup deletes >7 day notifications but keeps <=7 day notifications", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    const [oldNotif] = await db
      .insert(notifications)
      .values({
        userId: user1Id,
        type: "reminder",
        title: "Old Notification",
        body: "8 days old",
        createdAt: eightDaysAgo,
      })
      .returning()

    const [recentNotif] = await db
      .insert(notifications)
      .values({
        userId: user1Id,
        type: "reminder",
        title: "Recent Notification",
        body: "2 days old",
        createdAt: twoDaysAgo,
      })
      .returning()

    // Run cleanup cron
    await runNotificationCleanup()

    const oldCheck = await db.query.notifications.findFirst({ where: (n, { eq }) => eq(n.id, oldNotif.id) })
    const recentCheck = await db.query.notifications.findFirst({ where: (n, { eq }) => eq(n.id, recentNotif.id) })

    expect(oldCheck).toBeUndefined()
    expect(recentCheck).toBeDefined()

    // Cleanup recent
    await db.delete(notifications).where(eq(notifications.id, recentNotif.id))
  })

  it("29. runExpiredBansCleanup deletes expired temporary bans and preserves active/permanent bans", async () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)

    // Insert expired temporary ban
    const [expiredBan] = await db
      .insert(userBans)
      .values({
        userId: user1Id,
        bannedBy: adminId,
        reason: "Temporary test ban expired",
        permanent: false,
        expiresAt: expiredDate,
      })
      .returning()

    // Insert active temporary ban
    const [activeBan] = await db
      .insert(userBans)
      .values({
        userId: user2Id,
        bannedBy: adminId,
        reason: "Active temporary ban",
        permanent: false,
        expiresAt: futureDate,
      })
      .returning()

    await runExpiredBansCleanup()

    const expiredCheck = await db.query.userBans.findFirst({ where: (b, { eq }) => eq(b.id, expiredBan.id) })
    const activeCheck = await db.query.userBans.findFirst({ where: (b, { eq }) => eq(b.id, activeBan.id) })

    expect(expiredCheck).toBeUndefined()
    expect(activeCheck).toBeDefined()

    // Cleanup
    await db.delete(userBans).where(eq(userBans.id, activeBan.id))
  })

  it("30. runOldMatchesCleanup archives matches completed/cancelled >90 days ago", async () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)

    const [oldMatch] = await db
      .insert(matches)
      .values({
        app1Id,
        app2Id,
        user1Id,
        user2Id,
        status: "completed",
        updatedAt: hundredDaysAgo,
      })
      .returning()

    await runOldMatchesCleanup()

    const matchCheck = await db.query.matches.findFirst({ where: (m, { eq }) => eq(m.id, oldMatch.id) })
    expect(matchCheck?.status).toBe("archived")

    // Cleanup
    await db.delete(matches).where(eq(matches.id, oldMatch.id))
  })

  it("31. runDailyTestingReminders executes cleanly", async () => {
    let err = null
    try {
      await runDailyTestingReminders()
    } catch (e) {
      err = e
    }
    expect(err).toBeNull()
  })
})



