import { and, count, eq, not } from "drizzle-orm"

import { db } from "../db"
import { apps, dailyActivity, users } from "../db/schema"
import { isUserAdmin } from "../lib/constants"

export interface SyncUserDTO {
  tokenIdentifier: string
  name: string
  email: string
  avatarUrl?: string | null
}

export class UserService {
  /**
   * Syncs and provisions a user identity upon login.
   */
  static async syncUser(dto: SyncUserDTO) {
    const avatar =
      dto.avatarUrl ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(dto.name || "Developer")}&background=random`

    const existingUser = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.tokenIdentifier, dto.tokenIdentifier),
    })

    if (existingUser) {
      if (dto.email && dto.email.toLowerCase() !== existingUser.email.toLowerCase()) {
        const emailConflict = await db.query.users.findFirst({
          where: (u, { and, eq, not }) => and(eq(u.email, dto.email.toLowerCase()), not(eq(u.id, existingUser.id))),
        })
        if (emailConflict) {
          throw new Error("Email address is already registered to another user.")
        }
      }

      const isUserAdminRole = isUserAdmin(dto.email || existingUser.email, existingUser.isAdmin)

      const [updated] = await db
        .update(users)
        .set({
          name: dto.name || existingUser.name,
          email: dto.email ? dto.email.toLowerCase() : existingUser.email,
          avatarUrl: avatar,
          isAdmin: isUserAdminRole,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning()

      const [activeApps] = await db
        .select({ count: count() })
        .from(apps)
        .where(and(eq(apps.userId, existingUser.id), not(eq(apps.status, "archived"))))

      return { user: { ...updated, appsCount: activeApps?.count ?? 0 }, isNew: false }
    }

    const isUserAdminRole = isUserAdmin(dto.email, false)
    const [newUser] = await db
      .insert(users)
      .values({
        tokenIdentifier: dto.tokenIdentifier,
        name: dto.name || "Developer",
        email: dto.email ? dto.email.toLowerCase() : `${dto.tokenIdentifier}@theclosedtest.app`,
        avatarUrl: avatar,
        isAdmin: isUserAdminRole,
        reputation: 100,
        appsCount: 0,
        isGroupMember: false,
        streak: 0,
        bestStreak: 0,
        unlockedAppSlots: 3,
      })
      .returning()

    return { user: newUser, isNew: true }
  }

  /**
   * Retrieves profile details for a user with calculated active apps count.
   */
  static async getUserProfile(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) return null

    const [activeAppsResult] = await db
      .select({ count: count() })
      .from(apps)
      .where(and(eq(apps.userId, user.id), not(eq(apps.status, "archived"))))

    return {
      ...user,
      appsCount: activeAppsResult?.count ?? 0,
      googleGroupConfirmed: user.isGroupMember,
    }
  }

  /**
   * Performs daily check-in, maintains streak, and logs daily activity.
   */
  static async checkInDailyStreak(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) return null

    const today = new Date().toISOString().split("T")[0]

    // Log daily activity if not already logged today
    const existingLog = await db.query.dailyActivity.findFirst({
      where: (da, { and, eq }) => and(eq(da.userId, user.id), eq(da.date, today)),
    })

    if (!existingLog) {
      await db
        .insert(dailyActivity)
        .values({
          userId: user.id,
          date: today,
        })
        .catch(() => {})
    }

    if (user.lastCheckInDate === today) {
      return {
        streak: user.streak,
        bestStreak: user.bestStreak,
        alreadyCheckedIn: true,
        message: "Already checked in today!",
      }
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
    let newStreak = user.streak

    if (user.lastCheckInDate === yesterday) {
      newStreak += 1
    } else {
      newStreak = 1
    }

    const bestStreak = Math.max(user.bestStreak, newStreak)

    await db
      .update(users)
      .set({
        streak: newStreak,
        bestStreak,
        lastCheckInDate: today,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    return {
      streak: newStreak,
      bestStreak,
      alreadyCheckedIn: false,
      message: "Check-in successful! Streak updated.",
    }
  }

  /**
   * Registers an Expo push token for notifications.
   */
  static async updatePushToken(userId: string, pushToken: string) {
    await db.update(users).set({ pushToken, updatedAt: new Date() }).where(eq(users.id, userId))
  }

  /**
   * Marks Google Group membership verified.
   */
  static async confirmGoogleGroup(userId: string) {
    await db.update(users).set({ isGroupMember: true, updatedAt: new Date() }).where(eq(users.id, userId))
  }

  /**
   * Updates basic profile metadata (name, avatarUrl).
   */
  static async updateProfile(userId: string, data: { name?: string; avatarUrl?: string | null }) {
    const [updated] = await db
      .update(users)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()

    return updated
  }

  /**
   * Unlocks all 3 initial app slots for promotional event.
   */
  static async unlockAppSlots(userId: string) {
    const [updated] = await db
      .update(users)
      .set({
        unlockedAppSlots: 3,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()

    return updated
  }
}
