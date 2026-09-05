import { and, desc, eq, lt, or, sql } from "drizzle-orm"

import { db } from "../db"
import { matches, notifications, proofs, users } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { sendExpoPushNotification } from "../services/expo-push"

export async function runMatchProgressionAndCleanup() {
  console.log("⏰ Running match completion, abandonment, and cleanup checks...")

  const now = new Date()
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  try {
    // Process active matches for completion, abandonment, or reminders
    const activeMatches = await db.query.matches.findMany({
      where: eq(matches.status, "active"),
      with: {
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.submittedAt)],
        },
      },
    })

    for (const match of activeMatches) {
      const matchStart = match.startDate ? new Date(match.startDate) : match.updatedAt ? new Date(match.updatedAt) : now

      const user1Proofs = match.proofs?.filter((p) => p.uploaderId === match.user1Id) || []
      const user2Proofs = match.proofs?.filter((p) => p.uploaderId === match.user2Id) || []

      const user1ReachedDay14 = user1Proofs.some((p) => p.day >= 14)
      const user2ReachedDay14 = user2Proofs.some((p) => p.day >= 14)
      const fourteenDaysElapsed = matchStart <= fourteenDaysAgo
      const pendingProofs = match.proofs?.filter((p) => p.status === "pending") || []
      const hasPendingProof = pendingProofs.length > 0

      const both14Approved = match.user1ApprovedCount >= 14 && match.user2ApprovedCount >= 14
      // Concluded when no proofs are pending review AND both uploaded day 14
      const cycleConcludedNoPending = !hasPendingProof && user1ReachedDay14 && user2ReachedDay14
      // On Day 15: 14 full calendar days have elapsed. Do not wait for manual approval: auto-approve pending proofs and finish!
      const isDay15OrLater = fourteenDaysElapsed

      // 1. Auto-complete matches where testing concluded or on Day 15
      if (both14Approved || cycleConcludedNoPending || isDay15OrLater) {
        console.log(`🎉 Auto-completing 14-day match ${match.id} (Day 15 / cycle concluded)...`)

        let u1Inc = 0
        let u2Inc = 0

        // On Day 15: if peer tester never approved, auto-approve pending proofs so uploader gets credit
        if (hasPendingProof && isDay15OrLater) {
          for (const proof of pendingProofs) {
            await db
              .update(proofs)
              .set({
                status: "approved",
                reviewedAt: now,
                comment: "Auto-approved upon Day 15 testing completion",
              })
              .where(eq(proofs.id, proof.id))

            if (proof.uploaderId === match.user1Id) {
              u1Inc++
            } else if (proof.uploaderId === match.user2Id) {
              u2Inc++
            }

            // Reward uploader +1 reputation
            await db
              .update(users)
              .set({
                reputation: sql`${users.reputation} + 1`,
              })
              .where(eq(users.id, proof.uploaderId))
          }
        }

        await db
          .update(matches)
          .set({
            status: "completed",
            user1ApprovedCount: match.user1ApprovedCount + u1Inc,
            user2ApprovedCount: match.user2ApprovedCount + u2Inc,
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(matches.id, match.id))

        // Reward +20 reputation to both participants
        await db
          .update(users)
          .set({
            reputation: sql`${users.reputation} + 20`,
          })
          .where(sql`${users.id} = ${match.user1Id} OR ${users.id} = ${match.user2Id}`)

        await db.insert(notifications).values([
          {
            userId: match.user1Id,
            type: "reminder",
            title: "🎉 14-Day Testing Complete!",
            body: "Your testing match has completed! +20 reputation awarded.",
            data: { matchId: match.id, subtype: "match_completed" },
          },
          {
            userId: match.user2Id,
            type: "reminder",
            title: "🎉 14-Day Testing Complete!",
            body: "Your testing match has completed! +20 reputation awarded.",
            data: { matchId: match.id, subtype: "match_completed" },
          },
        ])

        if (match.user1?.pushToken) {
          sendExpoPushNotification({
            to: match.user1.pushToken,
            title: "🎉 14-Day Testing Complete!",
            body: "Your testing match has completed! +20 reputation awarded.",
            data: { matchId: match.id },
          }).catch(() => {})
        }
        if (match.user2?.pushToken) {
          sendExpoPushNotification({
            to: match.user2.pushToken,
            title: "🎉 14-Day Testing Complete!",
            body: "Your testing match has completed! +20 reputation awarded.",
            data: { matchId: match.id },
          }).catch(() => {})
        }

        continue // Successfully completed, do not evaluate for abandonment
      }

      // Guard: If the match has reached 14 days or Day 14 was submitted,
      // do NOT evaluate for abandonment (it is waiting for pending proof reviews).
      if (fourteenDaysElapsed || (user1ReachedDay14 && user2ReachedDay14)) {
        continue
      }

      // Guard: If the match itself started less than 2 full days ago,
      // it CANNOT be considered for warnings or abandonment under any circumstances.
      if (matchStart > twoDaysAgo) {
        continue
      }

      const user1LastActive = user1Proofs[0] ? new Date(user1Proofs[0].submittedAt) : matchStart
      const user2LastActive = user2Proofs[0] ? new Date(user2Proofs[0].submittedAt) : matchStart

      const user1Inactive = user1LastActive < threeDaysAgo && matchStart <= threeDaysAgo
      const user2Inactive = user2LastActive < threeDaysAgo && matchStart <= threeDaysAgo

      if (user1Inactive || user2Inactive) {
        console.log(`⚠️ Match ${match.id} abandoned due to testing inactivity (>3 days). Cancelling...`)

        await db
          .update(matches)
          .set({
            status: "cancelled",
            updatedAt: now,
          })
          .where(eq(matches.id, match.id))

        if (user1Inactive && !user2Inactive) {
          // User 1 abandoned
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(eq(users.id, match.user1Id))

          await db.insert(notifications).values([
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity Penalty)",
              body: "Your testing match was cancelled due to 3+ consecutive days of inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester stopped testing for 3+ consecutive days. The match was cancelled so you can match with an active tester.",
              data: { matchId: match.id },
            },
          ])

          if (match.user2?.pushToken) {
            sendExpoPushNotification({
              to: match.user2.pushToken,
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester was inactive. The match has ended so you can pair with a new tester.",
              data: { matchId: match.id },
            }).catch(() => {})
          }
        } else if (user2Inactive && !user1Inactive) {
          // User 2 abandoned
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(eq(users.id, match.user2Id))

          await db.insert(notifications).values([
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity Penalty)",
              body: "Your testing match was cancelled due to 3+ consecutive days of inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester stopped testing for 3+ consecutive days. The match was cancelled so you can match with an active tester.",
              data: { matchId: match.id },
            },
          ])

          if (match.user1?.pushToken) {
            sendExpoPushNotification({
              to: match.user1.pushToken,
              title: "Partner Inactive - Match Cancelled",
              body: "Your peer tester was inactive. The match has ended so you can pair with a new tester.",
              data: { matchId: match.id },
            }).catch(() => {})
          }
        } else {
          // Both inactive
          await db
            .update(users)
            .set({
              reputation: sql`GREATEST(0, ${users.reputation} - 10)`,
              streak: 0,
            })
            .where(or(eq(users.id, match.user1Id), eq(users.id, match.user2Id)))

          await db.insert(notifications).values([
            {
              userId: match.user1Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity)",
              body: "Your match was cancelled due to testing inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
            {
              userId: match.user2Id,
              type: "match_cancelled",
              title: "Match Cancelled (Inactivity)",
              body: "Your match was cancelled due to testing inactivity. -10 reputation penalty applied.",
              data: { matchId: match.id },
            },
          ])
        }
      } else {
        // 2b. Urgent 48-hour Inactivity Warning (24 hours before 72-hour cancellation)
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        // Check User 1
        if (user1LastActive < twoDaysAgo && matchStart <= twoDaysAgo) {
          const alreadyWarned1 = await db.query.notifications.findFirst({
            where: and(
              eq(notifications.userId, match.user1Id),
              eq(notifications.type, "reminder"),
              sql`${notifications.data}->>'subtype' = 'inactivity_warning'`,
              sql`${notifications.data}->>'matchId' = ${match.id}`,
              sql`${notifications.createdAt} >= ${twentyFourHoursAgo}`,
            ),
          })
          if (!alreadyWarned1) {
            await db.insert(notifications).values({
              userId: match.user1Id,
              type: "reminder",
              title: "⚠️ Urgent: Testing Match In Danger",
              body: "You haven't submitted test proof in 48 hours. Please upload proof within 24 hours to prevent your match from being cancelled with a -10 reputation penalty.",
              data: { matchId: match.id, subtype: "inactivity_warning" },
            })
            if (match.user1?.pushToken) {
              sendExpoPushNotification({
                to: match.user1.pushToken,
                title: "⚠️ Urgent: Testing Match In Danger",
                body: "You haven't submitted test proof in 48 hours. Upload proof within 24h to avoid match cancellation.",
                data: { matchId: match.id },
              }).catch(() => {})
            }
          }
        }

        // Check User 2
        if (user2LastActive < twoDaysAgo && matchStart <= twoDaysAgo) {
          const alreadyWarned2 = await db.query.notifications.findFirst({
            where: and(
              eq(notifications.userId, match.user2Id),
              eq(notifications.type, "reminder"),
              sql`${notifications.data}->>'subtype' = 'inactivity_warning'`,
              sql`${notifications.data}->>'matchId' = ${match.id}`,
              sql`${notifications.createdAt} >= ${twentyFourHoursAgo}`,
            ),
          })
          if (!alreadyWarned2) {
            await db.insert(notifications).values({
              userId: match.user2Id,
              type: "reminder",
              title: "⚠️ Urgent: Testing Match In Danger",
              body: "You haven't submitted test proof in 48 hours. Please upload proof within 24 hours to prevent your match from being cancelled with a -10 reputation penalty.",
              data: { matchId: match.id, subtype: "inactivity_warning" },
            })
            if (match.user2?.pushToken) {
              sendExpoPushNotification({
                to: match.user2.pushToken,
                title: "⚠️ Urgent: Testing Match In Danger",
                body: "You haven't submitted test proof in 48 hours. Upload proof within 24h to avoid match cancellation.",
                data: { matchId: match.id },
              }).catch(() => {})
            }
          }
        }
      }
    }

    // 3. Auto-expire stale pending requests older than 7 days
    const stalePendingMatches = await db.query.matches.findMany({
      where: and(eq(matches.status, "pending"), lt(matches.createdAt, sevenDaysAgo)),
    })

    if (stalePendingMatches.length > 0) {
      console.log(`🧹 Expiring ${stalePendingMatches.length} stale pending match requests (>7 days)...`)

      for (const pendingMatch of stalePendingMatches) {
        await db
          .update(matches)
          .set({
            status: "cancelled",
            updatedAt: now,
          })
          .where(eq(matches.id, pendingMatch.id))

        await db.insert(notifications).values({
          userId: pendingMatch.user1Id,
          type: "match_cancelled",
          title: "Match Request Expired",
          body: "Your match request expired after 7 days without response.",
          data: { matchId: pendingMatch.id },
        })
      }
    }

    // Invalidate public feed cache if matches progressed or completed
    memoryCache.delete("apps_list:")
  } catch (error) {
    console.error("❌ Failed match progression check:", error)
  }
}

export async function runOldMatchesCleanup() {
  console.log("⏰ Running 60-day completed/cancelled match archival...")

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const result = await db
      .update(matches)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(or(eq(matches.status, "completed"), eq(matches.status, "cancelled")), lt(matches.updatedAt, sixtyDaysAgo)),
      )
      .returning({ id: matches.id })

    if (result.length > 0) {
      console.log(`📦 Archived ${result.length} old matches (>60 days old)`)
    }
  } catch (error) {
    console.error("❌ Failed to archive old matches:", error)
  }
}
