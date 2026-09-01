import { and, count, desc, eq, ilike, inArray, not, or, sql } from "drizzle-orm"

import { db } from "../db"
import { appBans, apps, matches, users } from "../db/schema"
import { memoryCache } from "../lib/cache"
import { ReputationService } from "./reputation.service"

export interface CreateAppDTO {
  userId: string
  title: string
  packageName: string
  playStoreUrl: string
  iconUrl: string
  instructions: string
  requiredTesters: number
}

export interface UpdateAppDTO {
  title?: string
  packageName?: string
  playStoreUrl?: string
  iconUrl?: string
  instructions?: string
  requiredTesters?: number
  status?: "recruiting" | "paused" | "archived" | "completed"
}

export interface ListAppsQuery {
  search?: string
  limit?: number
  offset?: number
}

export class AppService {
  /**
   * Enriches a list of app entities with their active tester counts and dynamic status.
   */
  static async enrichAppsWithTesterCounts<T extends { id: string }>(
    appItems: T[],
  ): Promise<Array<T & { requiredTesters: number; currentTesters: number; status: any }>> {
    if (appItems.length === 0) return []
    const appIds = appItems.map((a) => a.id)

    const activeOrCompleted = or(eq(matches.status, "active"), eq(matches.status, "completed"))

    const [asApp1, asApp2] = await Promise.all([
      db
        .select({ appId: matches.app1Id, count: sql<number>`count(*)::int` })
        .from(matches)
        .where(and(inArray(matches.app1Id, appIds), activeOrCompleted))
        .groupBy(matches.app1Id),
      db
        .select({ appId: matches.app2Id, count: sql<number>`count(*)::int` })
        .from(matches)
        .where(and(inArray(matches.app2Id, appIds), activeOrCompleted))
        .groupBy(matches.app2Id),
    ])

    const countMap = new Map<string, number>()
    for (const row of [...asApp1, ...asApp2]) {
      if (!row.appId || !appIds.includes(row.appId)) continue
      countMap.set(row.appId, (countMap.get(row.appId) || 0) + row.count)
    }

    return appItems.map((item) => {
      const current = countMap.get(item.id) || 0
      const required = Math.min(12, Math.max(1, (item as any).requiredTesters || 12))
      const rawStatus = (item as any).status
      let dynamicStatus = rawStatus
      if (rawStatus !== "archived" && rawStatus !== "paused") {
        dynamicStatus = current >= required ? "filled" : "recruiting"
      }

      return {
        ...item,
        requiredTesters: required,
        currentTesters: current,
        status: dynamicStatus,
      }
    })
  }

  static async enrichAppWithTesterCount<T extends { id: string }>(
    app: T,
  ): Promise<T & { requiredTesters: number; currentTesters: number; status: any }> {
    const [enriched] = await this.enrichAppsWithTesterCounts([app])
    return enriched || (app as T & { requiredTesters: number; currentTesters: number; status: any })
  }

  /**
   * Retrieves public recruiting apps feed with caching and dynamic capacity ranking.
   */
  static async listPublicApps(query: ListAppsQuery) {
    const limit = query.limit ?? 20
    const offset = query.offset ?? 0
    const search = query.search?.trim()
    const cacheKey = `apps_list:${search || ""}:${limit}:${offset}`

    const cached = memoryCache.get<{ apps: any[]; total: number }>(cacheKey)
    if (cached) {
      return cached
    }

    const conditions = [
      not(eq(apps.status, "archived")),
      not(eq(apps.status, "paused")),
      or(eq(apps.visibilityStatus, "visible"), eq(apps.visibilityStatus, "unverified")),
    ]

    if (search) {
      conditions.push(or(ilike(apps.title, `%${search}%`), ilike(apps.packageName, `%${search}%`))!)
    }

    const rawItems = await db
      .select({
        app: apps,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          reputation: users.reputation,
        },
      })
      .from(apps)
      .leftJoin(users, eq(apps.userId, users.id))
      .where(and(...conditions))
      .orderBy(
        sql`CASE WHEN (
          SELECT COUNT(*)::int FROM matches m
          WHERE (m.app1_id = ${apps.id} OR m.app2_id = ${apps.id})
            AND m.status IN ('active', 'completed')
        ) >= LEAST(12, GREATEST(1, COALESCE(${apps.requiredTesters}, 12)))
          OR ${apps.status} = 'filled' THEN 1 ELSE 0 END`,
        desc(users.reputation),
        desc(apps.createdAt),
      )
      .limit(limit)
      .offset(offset)

    const items = rawItems.map((r) => ({
      ...r.app,
      user: r.user,
    }))

    const enrichedItems = await this.enrichAppsWithTesterCounts(items)

    const [countRow] = await db
      .select({ value: count() })
      .from(apps)
      .where(and(...conditions))

    enrichedItems.sort((a, b) => {
      const isFilledA = a.status === "filled" || a.currentTesters >= a.requiredTesters
      const isFilledB = b.status === "filled" || b.currentTesters >= b.requiredTesters

      if (isFilledA && !isFilledB) return 1
      if (isFilledB && !isFilledA) return -1

      const repA = a.user?.reputation ?? 100
      const repB = b.user?.reputation ?? 100
      if (repB !== repA) return repB - repA

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    const responseData = {
      apps: enrichedItems,
      total: Number(countRow?.value ?? enrichedItems.length),
    }

    memoryCache.set(cacheKey, responseData, 5)
    return responseData
  }

  /**
   * Retrieves apps submitted by a specific user.
   */
  static async listUserApps(userId: string) {
    const items = await db.query.apps.findMany({
      where: and(eq(apps.userId, userId), not(eq(apps.status, "archived"))),
      with: {
        user: true,
      },
      orderBy: [desc(apps.createdAt)],
    })

    return this.enrichAppsWithTesterCounts(items)
  }

  /**
   * Retrieves single app details with owner information.
   */
  static async getAppById(id: string) {
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, id),
      with: {
        user: true,
      },
    })

    if (!app) return null
    return this.enrichAppWithTesterCount(app)
  }

  /**
   * Registers a new app with validation for banned packages and slot availability.
   */
  static async createApp(dto: CreateAppDTO) {
    const cleanPkg = dto.packageName.trim()

    // 1. Verify not banned
    const isBanned = await db.query.appBans.findFirst({
      where: eq(appBans.packageName, cleanPkg),
    })
    if (isBanned) {
      throw new Error("This app package has been banned from testing.")
    }

    // 2. Verify duplicate registration
    const existing = await db.query.apps.findFirst({
      where: and(ilike(apps.packageName, cleanPkg), not(eq(apps.status, "archived"))),
    })
    if (existing) {
      throw new Error(`An app with package name "${cleanPkg}" is already registered in the system.`)
    }

    // 3. Verify user slot limit
    const user = await db.query.users.findFirst({
      where: eq(users.id, dto.userId),
    })
    if (!user) {
      throw new Error("User not found")
    }

    const currentActiveApps = await db.query.apps.findMany({
      where: and(eq(apps.userId, user.id), not(eq(apps.status, "archived"))),
    })
    if (currentActiveApps.length >= user.unlockedAppSlots) {
      throw new Error(
        `You have reached your maximum active app limit (${user.unlockedAppSlots}). Test other apps or maintain your streak to unlock more slots!`,
      )
    }

    const [newApp] = await db
      .insert(apps)
      .values({
        userId: dto.userId,
        title: dto.title.trim(),
        packageName: cleanPkg,
        playStoreUrl: dto.playStoreUrl.trim(),
        iconUrl: dto.iconUrl.trim(),
        instructions: dto.instructions,
        requiredTesters: dto.requiredTesters,
        status: "recruiting",
        visibilityStatus: "unverified",
      })
      .returning()

    memoryCache.delete("apps_list:")
    return { ...newApp, currentTesters: 0 }
  }

  /**
   * Updates an existing app with transaction safety and reputation adjustments.
   */
  static async updateApp(id: string, userId: string, dto: UpdateAppDTO) {
    const existing = await db.query.apps.findFirst({
      where: eq(apps.id, id),
    })

    if (!existing) {
      return { notFound: true }
    }
    if (existing.userId !== userId) {
      return { forbidden: true }
    }

    if (dto.packageName && dto.packageName.trim().toLowerCase() !== existing.packageName.toLowerCase()) {
      const conflict = await db.query.apps.findFirst({
        where: and(
          ilike(apps.packageName, dto.packageName.trim()),
          not(eq(apps.id, id)),
          not(eq(apps.status, "archived")),
        ),
      })
      if (conflict) {
        throw new Error(`An app with package name "${dto.packageName.trim()}" is already registered in the system.`)
      }
    }

    const shouldResetFlags = existing.visibilityStatus === "hidden" || existing.flagCount > 0

    let updatedApp: any
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(apps)
        .set({
          ...dto,
          ...(shouldResetFlags ? { flagCount: 0, visibilityStatus: "unverified" } : {}),
          updatedAt: new Date(),
        })
        .where(eq(apps.id, id))
        .returning()

      updatedApp = updated

      // Reward +20 reputation if status transitions to completed
      if (dto.status === "completed" && existing.status !== "completed") {
        await ReputationService.changeReputation({
          userId,
          delta: 20,
          reason: "app_completed",
          referenceId: id,
          tx,
        })
      }
    })

    memoryCache.delete("apps_list:")
    return { app: await this.enrichAppWithTesterCount(updatedApp) }
  }

  /**
   * Casts a community vote on app visibility.
   */
  static async voteApp(appId: string, voterId: string, type: "positive" | "negative") {
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    })
    if (!app) {
      return { notFound: true }
    }

    if (app.voters.includes(voterId)) {
      return { alreadyVoted: true }
    }

    const positiveVotes = type === "positive" ? app.positiveVotes + 1 : app.positiveVotes
    const negativeVotes = type === "negative" ? app.negativeVotes + 1 : app.negativeVotes
    const updatedVoters = [...app.voters, voterId]

    let visibilityStatus = app.visibilityStatus
    if (positiveVotes >= 3 && positiveVotes > negativeVotes) {
      visibilityStatus = "visible"
    } else if (negativeVotes >= 3 && negativeVotes > positiveVotes) {
      visibilityStatus = "hidden"
    }

    await db
      .update(apps)
      .set({
        positiveVotes,
        negativeVotes,
        visibilityStatus,
        voters: updatedVoters,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId))

    memoryCache.delete("apps_list:")
    return { success: true }
  }
}

export const enrichAppsWithTesterCounts = AppService.enrichAppsWithTesterCounts.bind(AppService)
