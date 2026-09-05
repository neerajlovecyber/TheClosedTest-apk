import { and, desc, eq, or } from "drizzle-orm"

import { db } from "../db"
import { apps, matches, messages, proofs } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { AppService } from "./app.service"
import { NotificationService } from "./notification.service"

export interface RequestMatchDTO {
  userId: string
  userName?: string
  app1Id?: string
  myAppId?: string
  targetAppId?: string
  app2Id?: string
}

export class MatchService {
  /**
   * Submits a peer-testing match request between two apps.
   */
  static async requestMatch(dto: RequestMatchDTO) {
    let app1Id = dto.myAppId || dto.app1Id
    const targetAppId = dto.targetAppId || dto.app2Id

    if (!targetAppId) {
      throw new Error("Target app ID is required")
    }

    if (!app1Id) {
      const userApp = await db.query.apps.findFirst({
        where: eq(apps.userId, dto.userId),
      })
      if (!userApp) {
        throw new Error("You must add at least one app before requesting a swap")
      }
      app1Id = userApp.id
    }

    // 1. Verify source app ownership
    const app1 = await db.query.apps.findFirst({
      where: (a, { eq }) => eq(a.id, app1Id!),
    })

    if (!app1 || app1.userId !== dto.userId) {
      throw new Error("You must own the source app")
    }

    // 2. Verify target app
    const app2 = await db.query.apps.findFirst({
      where: (a, { eq }) => eq(a.id, targetAppId),
    })

    if (!app2) {
      throw new Error("Target app not found")
    }

    if (app2.userId === dto.userId) {
      throw new Error("Cannot match with your own app")
    }

    if (app1.status === "archived" || app2.status === "archived") {
      throw new Error("Cannot request match: One of the apps has been archived or deleted")
    }

    // 3. Verify tester capacities
    const [enrichedApp1, enrichedApp2] = await AppService.enrichAppsWithTesterCounts([app1, app2])
    const count1 = (enrichedApp1 as any)?.currentTesters ?? 0
    const count2 = (enrichedApp2 as any)?.currentTesters ?? 0

    if (count1 >= app1.requiredTesters) {
      throw new Error(
        `Cannot request swap: Your app "${app1.title}" has reached full tester capacity (${count1}/${app1.requiredTesters})`,
      )
    }

    if (count2 >= app2.requiredTesters) {
      throw new Error(
        `Cannot request swap: "${app2.title}" has reached full tester capacity (${count2}/${app2.requiredTesters})`,
      )
    }

    // 4. Verify no duplicate pending or active match between these apps
    const existing = await db.query.matches.findFirst({
      where: (m, { and, or, eq }) =>
        and(
          or(
            and(eq(m.app1Id, app1Id!), eq(m.app2Id, targetAppId)),
            and(eq(m.app1Id, targetAppId), eq(m.app2Id, app1Id!)),
          ),
          or(eq(m.status, "pending"), eq(m.status, "active")),
        ),
    })

    if (existing) {
      throw new Error("A match request or active test already exists between these apps")
    }

    // 5. Create match
    const [newMatch] = await db
      .insert(matches)
      .values({
        user1Id: dto.userId,
        app1Id: app1.id,
        user2Id: app2.userId,
        app2Id: app2.id,
        status: "pending",
        user1ApprovedCount: 0,
        user2ApprovedCount: 0,
      })
      .returning()

    // 6. Notify target user asynchronously
    NotificationService.send({
      userId: app2.userId,
      type: "request",
      title: "New Testing Request!",
      body: `${dto.userName || "A developer"} wants to test ${app2.title} in exchange for ${app1.title}.`,
      pushBody: `${dto.userName || "A developer"} requested a peer test with ${app2.title}!`,
      data: { matchId: newMatch.id, app1Id: app1.id, app2Id: app2.id },
    }).catch(() => {})

    return newMatch
  }

  /**
   * Retrieves matches for a user with status filtering and enriched metadata.
   */
  static async listUserMatches(userId: string, tokenIdentifier?: string | null, status: string = "all") {
    const conditions = [or(eq(matches.user1Id, userId), eq(matches.user2Id, userId))]

    if (status !== "all") {
      if (status === "completed") {
        conditions.push(or(eq(matches.status, "completed"), eq(matches.status, "archived")))
      } else {
        conditions.push(eq(matches.status, status as any))
      }
    }

    const items = await db.query.matches.findMany({
      where: and(...conditions),
      with: {
        app1: true,
        app2: true,
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
        },
        messages: {
          orderBy: [desc(messages.sentAt)],
        },
      },
      orderBy: [desc(matches.lastActivity)],
    })

    const allApps = items.flatMap((m) => [m.app1, m.app2].filter(Boolean))
    const enrichedApps = await AppService.enrichAppsWithTesterCounts(allApps)
    const appMap = new Map(enrichedApps.map((a) => [a.id, a]))

    return items.map((m) => {
      const matchProofs = m.proofs || []
      const user1LatestProof = matchProofs.find((p) => p.uploaderId === m.user1Id)
      const user2LatestProof = matchProofs.find((p) => p.uploaderId === m.user2Id)
      const latestMsg = m.messages?.[0]
      const isUser1 = m.user1Id === userId || (tokenIdentifier && m.user1Id === tokenIdentifier)
      const myLastRead = isUser1 ? m.lastRead1 : m.lastRead2
      const isMsgFromMe =
        latestMsg &&
        (latestMsg.senderId === userId ||
          (tokenIdentifier && latestMsg.senderId === tokenIdentifier) ||
          latestMsg.senderId === "me")

      const hasUnreadMessages = Boolean(
        latestMsg &&
        !isMsgFromMe &&
        (!myLastRead || new Date(latestMsg.sentAt).getTime() > new Date(myLastRead).getTime()),
      )

      const resolvedApp1 = m.app1 ? appMap.get(m.app1.id) || m.app1 : null
      const resolvedApp2 = m.app2 ? appMap.get(m.app2.id) || m.app2 : null
      const myApp = isUser1 ? resolvedApp1 : resolvedApp2
      const partnerApp = isUser1 ? resolvedApp2 : resolvedApp1
      const partnerUser = isUser1 ? m.user2 : m.user1

      return {
        ...m,
        isUser1,
        myApp,
        partnerApp,
        partnerUser,
        app1: resolvedApp1,
        app2: resolvedApp2,
        hasUnreadMessages,
        latestMessage: latestMsg
          ? {
              content: latestMsg.content,
              sentAt: String(latestMsg.sentAt),
              senderId: latestMsg.senderId,
            }
          : null,
        user1LastProof: user1LatestProof
          ? {
              day: user1LatestProof.day,
              status: user1LatestProof.status,
              updatedAt: String(user1LatestProof.submittedAt),
            }
          : m.user1LastProof,
        user2LastProof: user2LatestProof
          ? {
              day: user2LatestProof.day,
              status: user2LatestProof.status,
              updatedAt: String(user2LatestProof.submittedAt),
            }
          : m.user2LastProof,
      }
    })
  }

  /**
   * Retrieves full match details for an authorized participant.
   */
  static async getMatchById(matchId: string, userId: string) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
      with: {
        app1: true,
        app2: true,
        user1: true,
        user2: true,
        proofs: {
          orderBy: [desc(proofs.day), desc(proofs.submittedAt)],
        },
      },
    })

    if (!match) return { notFound: true as const }
    if (match.user1Id !== userId && match.user2Id !== userId) {
      return { forbidden: true as const }
    }

    const matchProofs = match.proofs || []
    const user1LatestProof = matchProofs.find((p) => p.uploaderId === match.user1Id)
    const user2LatestProof = matchProofs.find((p) => p.uploaderId === match.user2Id)

    const [enrichedApp1, enrichedApp2] = await AppService.enrichAppsWithTesterCounts(
      [match.app1, match.app2].filter(Boolean) as any[],
    )
    const app1 = enrichedApp1 || match.app1
    const app2 = enrichedApp2 || match.app2

    const isUser1 = match.user1Id === userId
    const myApp = isUser1 ? app1 : app2
    const partnerApp = isUser1 ? app2 : app1
    const partnerUser = isUser1 ? match.user2 : match.user1

    const enrichedMatch = {
      ...match,
      isUser1,
      myApp,
      partnerApp,
      partnerUser,
      app1,
      app2,
      user1LastProof: user1LatestProof
        ? {
            day: user1LatestProof.day,
            status: user1LatestProof.status,
            updatedAt: String(user1LatestProof.submittedAt),
          }
        : match.user1LastProof,
      user2LastProof: user2LatestProof
        ? {
            day: user2LatestProof.day,
            status: user2LatestProof.status,
            updatedAt: String(user2LatestProof.submittedAt),
          }
        : match.user2LastProof,
    }

    return {
      match: enrichedMatch,
      app1,
      app2,
      user1: match.user1,
      user2: match.user2,
      isUser1,
      myApp,
      partnerApp,
      partnerUser,
    }
  }

  /**
   * Accepts a pending match with capacity re-validation.
   */
  static async acceptMatch(matchId: string, userId: string) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || match.user2Id !== userId || match.status !== "pending") {
      throw new Error("Forbidden: Only target user can accept a pending match")
    }

    const [app1, app2] = await Promise.all([
      db.query.apps.findFirst({ where: (a, { eq }) => eq(a.id, match.app1Id) }),
      db.query.apps.findFirst({ where: (a, { eq }) => eq(a.id, match.app2Id) }),
    ])

    if (!app1 || !app2) {
      throw new Error("One of the matched apps was not found")
    }

    if (app1.status === "archived" || app2.status === "archived") {
      throw new Error("Cannot accept: One of the apps has been archived or deleted")
    }

    const [enrichedApp1, enrichedApp2] = await AppService.enrichAppsWithTesterCounts([app1, app2])
    const count1 = (enrichedApp1 as any)?.currentTesters ?? 0
    const count2 = (enrichedApp2 as any)?.currentTesters ?? 0

    if (count1 >= app1.requiredTesters) {
      throw new Error(
        `Cannot accept: "${app1.title}" has reached full tester capacity (${count1}/${app1.requiredTesters})`,
      )
    }

    if (count2 >= app2.requiredTesters) {
      throw new Error(
        `Cannot accept: "${app2.title}" has reached full tester capacity (${count2}/${app2.requiredTesters})`,
      )
    }

    const now = new Date()
    const [updated] = await db
      .update(matches)
      .set({
        status: "active",
        startDate: now,
        lastActivity: now,
        updatedAt: now,
      })
      .where(eq(matches.id, matchId))
      .returning()

    memoryCache.delete("apps_list:")

    // Asynchronously notify requester
    NotificationService.send({
      userId: match.user1Id,
      type: "acceptance",
      title: "Match Accepted!",
      body: "Your testing exchange was accepted! Day 1 testing starts today.",
      pushBody: "Your peer testing partner accepted! Day 1 testing has started.",
      data: { matchId: match.id },
    }).catch(() => {})

    return updated
  }

  /**
   * Rejects a pending match or cancels an active match.
   */
  static async rejectOrCancelMatch(matchId: string, userId: string, userName?: string) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      throw new Error("Forbidden: Not part of match")
    }

    const [updated] = await db
      .update(matches)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
      .returning()

    memoryCache.delete("apps_list:")

    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id
    NotificationService.send({
      userId: partnerId,
      type: "match_cancelled",
      title: "Testing Ended",
      body: `${userName || "Your partner"} has left or cancelled the testing match.`,
      data: { matchId: match.id },
    }).catch(() => {})

    return updated
  }
}
