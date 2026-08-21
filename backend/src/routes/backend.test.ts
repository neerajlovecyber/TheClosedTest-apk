import { afterAll, describe, expect, it } from "vitest"

import app from "../app"

describe("TheClosedTest Full Backend Integration Test Suite", () => {
  const user1TokenId = `test-clerk-${crypto.randomUUID()}`
  const user2TokenId = `test-clerk-${crypto.randomUUID()}`
  let user1Id: string = ""
  let user2Id: string = ""
  let app1Id: string = ""
  let app2Id: string = ""
  let matchId: string = ""
  let proofId: string = ""

  // -------------------------------------------------------------------------
  // 1. User Sync & Profile Lifecycle
  // -------------------------------------------------------------------------
  it("1. POST /api/users/sync creates user 1", async () => {
    const res = await app.request("/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIdentifier: user1TokenId,
        name: "Developer Alice",
        email: `alice-${Date.now()}@example.com`,
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe("Developer Alice")
    expect(data.reputation).toBe(100)
    user1Id = data.id
  })

  it("2. POST /api/users/sync creates user 2", async () => {
    const res = await app.request("/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIdentifier: user2TokenId,
        name: "Developer Bob",
        email: `bob-${Date.now()}@example.com`,
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe("Developer Bob")
    user2Id = data.id
  })

  it("3. GET /api/users/me returns authenticated user details", async () => {
    const res = await app.request("/api/users/me", {
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(user1Id)
    expect(data.name).toBe("Developer Alice")
  })

  it("4. POST /api/users/checkin increments streak on daily check-in", async () => {
    const res = await app.request("/api/users/checkin", {
      method: "POST",
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.streak).toBeGreaterThanOrEqual(1)
    expect(data.alreadyCheckedIn).toBe(false)
  })

  it("5. POST /api/users/checkin handles repeated check-in idempotently", async () => {
    const res = await app.request("/api/users/checkin", {
      method: "POST",
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.alreadyCheckedIn).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 2. Apps Management & Listing
  // -------------------------------------------------------------------------
  it("6. POST /api/apps creates a new app for Alice", async () => {
    const res = await app.request("/api/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1TokenId}`,
      },
      body: JSON.stringify({
        title: "Alice Habit Tracker",
        packageName: `com.alice.habit_${Date.now()}`,
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.alice.habit",
        iconUrl: "https://assets.theclosedtest.com/icons/habit.png",
        instructions: "Please open daily, complete at least one task, and submit screenshot.",
        requiredTesters: 12,
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.title).toBe("Alice Habit Tracker")
    expect(data.status).toBe("recruiting")
    app1Id = data.id
  })

  it("7. POST /api/apps creates a new app for Bob", async () => {
    const res = await app.request("/api/apps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2TokenId}`,
      },
      body: JSON.stringify({
        title: "Bob Expense Manager",
        packageName: `com.bob.expenses_${Date.now()}`,
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.bob.expenses",
        iconUrl: "https://assets.theclosedtest.com/icons/expenses.png",
        instructions: "Please test expense creation and export features daily.",
        requiredTesters: 12,
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.title).toBe("Bob Expense Manager")
    app2Id = data.id
  })

  it("8. GET /api/apps returns public list of recruiting apps", async () => {
    const res = await app.request("/api/apps")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.apps.length).toBeGreaterThan(0)
  })

  it("9. GET /api/apps/my returns only user's apps", async () => {
    const res = await app.request("/api/apps/my", {
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].id).toBe(app1Id)
  })

  // -------------------------------------------------------------------------
  // 3. Matchmaking & 14-Day Testing Lifecycle
  // -------------------------------------------------------------------------
  it("10. POST /api/matches/request allows Alice to request peer-test with Bob's app", async () => {
    const res = await app.request("/api/matches/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1TokenId}`,
      },
      body: JSON.stringify({
        app1Id: app1Id,
        targetAppId: app2Id,
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.status).toBe("pending")
    expect(data.user1Id).toBe(user1Id)
    expect(data.user2Id).toBe(user2Id)
    matchId = data.id
  })

  it("11. POST /api/matches/:id/accept allows Bob to accept match", async () => {
    const res = await app.request(`/api/matches/${matchId}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user2TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("active")
    expect(data.startDate).not.toBeNull()
  })

  it("12. GET /api/matches/:id returns match details with app entities", async () => {
    const res = await app.request(`/api/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.match.id).toBe(matchId)
    expect(data.app1.title).toBe("Alice Habit Tracker")
    expect(data.app2.title).toBe("Bob Expense Manager")
  })

  // -------------------------------------------------------------------------
  // 4. Daily Proof Submission & Review Approval
  // -------------------------------------------------------------------------
  it("13. POST /api/proofs allows Alice to submit Day 1 proof for testing Bob's app", async () => {
    const res = await app.request("/api/proofs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1TokenId}`,
      },
      body: JSON.stringify({
        matchId,
        day: 1,
        type: "image",
        storageUrls: ["https://assets.theclosedtest.com/proofs/day1_alice.png"],
        comment: "Tested splash screen and created first transaction. Everything smooth!",
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.day).toBe(1)
    expect(data.status).toBe("pending")
    proofId = data.id
  })

  it("14. POST /api/proofs/:id/review allows Bob to approve Alice's Day 1 proof", async () => {
    const res = await app.request(`/api/proofs/${proofId}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2TokenId}`,
      },
      body: JSON.stringify({
        status: "approved",
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("approved")

    // Verify Alice (user1) reputation incremented to 101
    const aliceRes = await app.request("/api/users/me", {
      headers: { Authorization: `Bearer ${user1TokenId}` },
    })
    const aliceData = await aliceRes.json()
    expect(aliceData.reputation).toBe(101)
  })

  // -------------------------------------------------------------------------
  // 5. In-Match Chat Messaging
  // -------------------------------------------------------------------------
  it("15. POST /api/messages/:matchId sends chat message between testers", async () => {
    const res = await app.request(`/api/messages/${matchId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1TokenId}`,
      },
      body: JSON.stringify({
        content: "Hi Bob! Just submitted my Day 1 testing proof. Please check it out!",
        type: "text",
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.content).toContain("Hi Bob!")
  })

  it("16. GET /api/messages/:matchId returns conversation history", async () => {
    const res = await app.request(`/api/messages/${matchId}`, {
      headers: { Authorization: `Bearer ${user2TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 6. Notifications & Presigned Storage
  // -------------------------------------------------------------------------
  it("17. GET /api/notifications returns in-app notification inbox", async () => {
    const res = await app.request("/api/notifications", {
      headers: { Authorization: `Bearer ${user2TokenId}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.notifications.length).toBeGreaterThan(0)
    expect(data.unreadCount).toBeGreaterThanOrEqual(1)
  })

  it("18. POST /api/storage/presigned-url generates R2 upload target", async () => {
    const res = await app.request("/api/storage/presigned-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1TokenId}`,
      },
      body: JSON.stringify({
        filename: "screenshot_day2.png",
        contentType: "image/png",
        folder: "proofs",
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.uploadUrl).toBeDefined()
    expect(data.publicUrl).toBeDefined()
    expect(data.key).toContain("proofs/")
  })

  it("19. GET /api/leaderboard returns active boost leaderboard", async () => {
    const res = await app.request("/api/leaderboard")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.leaderboard)).toBe(true)
  })

  // Cleanup all test records created in this test run
  afterAll(async () => {
    try {
      const { db } = await import("../db")
      const { users, apps, matches, proofs, messages, notifications, dailyActivity, adminChats, adminMessages } = await import("../db/schema")
      const { eq, or, inArray } = await import("drizzle-orm")

      if (matchId) {
        await db.delete(proofs).where(eq(proofs.matchId, matchId)).catch(() => {})
        await db.delete(messages).where(eq(messages.matchId, matchId)).catch(() => {})
        await db.delete(matches).where(eq(matches.id, matchId)).catch(() => {})
      }

      const testAppIds = [app1Id, app2Id].filter(Boolean)
      if (testAppIds.length > 0) {
        await db.delete(apps).where(inArray(apps.id, testAppIds)).catch(() => {})
      }

      const testUserIds = [user1Id, user2Id].filter(Boolean)
      if (testUserIds.length > 0) {
        await db.delete(dailyActivity).where(inArray(dailyActivity.userId, testUserIds)).catch(() => {})
        await db.delete(notifications).where(inArray(notifications.userId, testUserIds)).catch(() => {})
        await db.delete(adminChats).where(inArray(adminChats.userId, testUserIds)).catch(() => {})
        await db.delete(users).where(inArray(users.id, testUserIds)).catch(() => {})
      }
    } catch {
      // ignore cleanup errors
    }
  })
})
