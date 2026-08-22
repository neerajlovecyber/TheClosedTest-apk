/**
 * React Query Hooks for TheClosedTest
 * Typed data hooks replacing Convex useQuery & useMutation across mobile screens.
 */

import { useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useFocusEffect } from "expo-router"
import { api } from "./api"

/**
 * Centralized Hook for React Native / Expo Router Screen Focus Refetching.
 * Automatically triggers background refetch whenever user navigates or switches tabs.
 */
export function useRefreshOnFocus<T>(refetch: () => Promise<T>) {
  const firstTimeRef = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (firstTimeRef.current) {
        firstTimeRef.current = false
        return
      }
      refetch()
    }, [refetch]),
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UserProfile {
  id: string
  tokenIdentifier: string
  name: string
  email: string
  avatarUrl?: string | null
  reputation: number
  appsCount: number
  isAdmin: boolean
  isGroupMember: boolean
  streak: number
  bestStreak: number
  lastCheckInDate?: string | null
  unlockedAppSlots: number
  googleGroupConfirmed?: boolean
  pushToken?: string | null
  createdAt: string
  updatedAt: string
}

export interface AppEntity {
  id: string
  userId: string
  title: string
  packageName: string
  playStoreUrl: string
  iconUrl: string
  instructions: string
  requiredTesters: number
  currentTesters: number
  status: "recruiting" | "filled" | "paused" | "archived" | "completed"
  completedAt?: string | null
  flagCount: number
  visibilityStatus?: "unverified" | "visible" | "hidden" | null
  positiveVotes: number
  negativeVotes: number
  voters: string[]
  createdAt: string
  updatedAt: string
  user?: UserProfile
}

export interface MatchSummaryProof {
  day: number
  status: "pending" | "approved" | "rejected"
  updatedAt: string
}

export interface MatchEntity {
  id: string
  user1Id: string
  user2Id: string
  app1Id: string
  app2Id: string
  status: "pending" | "active" | "completed" | "cancelled" | "rejected" | "archived"
  startDate?: string | null
  completedAt?: string | null
  user1ApprovedCount: number
  user2ApprovedCount: number
  user1LastProof?: MatchSummaryProof | null
  user2LastProof?: MatchSummaryProof | null
  lastRead1?: string | null
  lastRead2?: string | null
  hasUnreadMessages?: boolean
  latestMessage?: {
    content: string
    sentAt: string
    senderId: string
  } | null
  lastActivity: string
  createdAt: string
  app1?: AppEntity
  app2?: AppEntity
  user1?: UserProfile
  user2?: UserProfile
  proofs?: ProofEntity[]
}

export interface ProofEntity {
  id: string
  matchId: string
  uploaderId: string
  day: number
  type: "image" | "video"
  storageUrls: string[]
  status: "pending" | "approved" | "rejected"
  comment?: string | null
  rejectionReason?: string | null
  submittedAt: string
  reviewedAt?: string | null
}

export interface MessageEntity {
  id: string
  matchId: string
  senderId: string
  content: string
  type: "text" | "image" | "video"
  storageUrl?: string | null
  sentAt: string
}

export interface NotificationEntity {
  id: string
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown> | null
  read?: boolean
  isRead: boolean
  createdAt: string
}

export type User = UserProfile

export interface LeaderboardEntry {
  id: string
  userId: string
  name?: string
  avatarUrl?: string | null
  reputation?: number
  completedMatchesCount?: number
  appId?: string | null
  boostScore: number
  user?: {
    name: string
    avatarUrl?: string | null
    reputation: number
    completedMatchesCount?: number
  }
}

// ---------------------------------------------------------------------------
// 1. User & Authentication Hooks
// ---------------------------------------------------------------------------
export function useCurrentUser() {
  return useQuery<UserProfile | null>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      try {
        const u = await api.get<UserProfile>("/api/users/me")
        if (u) {
          const isMember = Boolean((u as any).isGroupMember || u.googleGroupConfirmed)
          return {
            ...u,
            isGroupMember: isMember,
            googleGroupConfirmed: isMember,
          }
        }
        return null
      } catch {
        return null
      }
    },
    staleTime: 1000 * 30, // 30 seconds
  })
}

export function useSyncUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userData: {
      tokenIdentifier: string
      name?: string
      email?: string
      avatarUrl?: string
      pushToken?: string
    }) => api.post<UserProfile>("/api/users/sync", userData),
    onSuccess: (user) => {
      queryClient.setQueryData(["currentUser"], user)
    },
  })
}

export function useCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ streak: number; bestStreak: number; alreadyCheckedIn: boolean }>(
        "/api/users/checkin",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })
}

export function useUpdatePushToken() {
  return useMutation({
    mutationFn: (pushToken: string) =>
      api.patch("/api/users/push-token", { pushToken }),
  })
}

export function useConfirmGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch("/api/users/group-confirm", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })
}

export function useUnlockSlots() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<UserProfile>("/api/users/unlock-slots", {}),
    onSuccess: (user) => {
      queryClient.setQueryData(["currentUser"], user)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["apps"] })
    },
  })
}

// ---------------------------------------------------------------------------
// 2. Apps Feed & Management Hooks
// ---------------------------------------------------------------------------
export function useRecruitingApps(search?: string, limit = 50, offset = 0) {
  return useQuery<{ apps: AppEntity[]; total: number }>({
    queryKey: ["apps", { search, limit, offset }],
    queryFn: () =>
      api.get<{ apps: AppEntity[]; total: number }>("/api/apps", {
        params: { search, limit, offset },
      }),
    staleTime: 1000 * 10,
  })
}

export function useMyApps() {
  return useQuery<AppEntity[]>({
    queryKey: ["myApps"],
    queryFn: () => api.get<AppEntity[]>("/api/apps/my"),
    staleTime: 1000 * 10,
  })
}

export function useAppDetails(id?: string) {
  return useQuery<AppEntity>({
    queryKey: ["app", id],
    queryFn: () => api.get<AppEntity>(`/api/apps/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (newApp: {
      title: string
      packageName: string
      playStoreUrl: string
      iconUrl: string
      instructions: string
      requiredTesters?: number
    }) => api.post<AppEntity>("/api/apps", newApp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })
}

export function useUpdateApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...updates
    }: {
      id: string
      title?: string
      instructions?: string
      playStoreUrl?: string
      iconUrl?: string
      status?: "recruiting" | "filled" | "paused" | "archived" | "completed"
    }) => api.patch<AppEntity>(`/api/apps/${id}`, updates),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["app", vars.id] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })
}

export function useVoteApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ appId, type }: { appId: string; type: "positive" | "negative" }) =>
      api.post(`/api/apps/${appId}/vote`, { type }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["app", vars.appId] })
    },
  })
}

// ---------------------------------------------------------------------------
// 3. Matchmaking & Peer-Testing Flow Hooks
// ---------------------------------------------------------------------------

export function useRecruitingMatches() {
  return useQuery<MatchEntity[]>({
    queryKey: ["matches", "recruiting"],
    queryFn: () => api.get<MatchEntity[]>("/api/matches/recruiting"),
  })
}

export function useMatches(status?: string) {
  return useQuery<MatchEntity[]>({
    queryKey: ["matches", { status }],
    queryFn: () =>
      api.get<MatchEntity[]>("/api/matches", {
        params: { status },
      }),
    refetchInterval: 1000 * 15,
  })
}

export function useMatch(id?: string) {
  return useQuery<MatchEntity>({
    queryKey: ["match", id],
    queryFn: () => api.get<MatchEntity>(`/api/matches/${id}`),
    enabled: Boolean(id),
    refetchInterval: 1000 * 10,
  })
}

export function useRequestMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      payload:
        | string
        | {
            myAppId?: string
            targetAppId?: string
            app1Id?: string
            app2Id?: string
          },
    ) => {
      const body = typeof payload === "string" ? { targetAppId: payload } : payload
      return api.post<MatchEntity>("/api/matches/request", body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
    },
  })
}

export function useAcceptMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => api.post<MatchEntity>(`/api/matches/${matchId}/accept`),
    onSuccess: (acceptedMatch, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })

      if (acceptedMatch) {
        queryClient.setQueryData<MatchEntity[]>(
          ["matches", { status: "active" }],
          (old = []) => {
            const exists = old.some((m) => m.id === matchId)
            if (exists) {
              return old.map((m) => (m.id === matchId ? { ...m, ...acceptedMatch, status: "active" as const } : m))
            }
            return [acceptedMatch, ...old]
          },
        )
        queryClient.setQueryData<MatchEntity[]>(
          ["matches", { status: "pending" }],
          (old = []) => old.filter((m) => m.id !== matchId),
        )
      }
    },
    onSettled: (_, _err, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["apps"] })
    },
  })
}

export function useRejectMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => api.post<MatchEntity>(`/api/matches/${matchId}/reject`),
    onSuccess: (_, matchId) => {
      queryClient.setQueryData<MatchEntity[]>(
        ["matches", { status: "pending" }],
        (old = []) => old.filter((m) => m.id !== matchId),
      )
      queryClient.setQueryData<MatchEntity[]>(
        ["matches", { status: "active" }],
        (old = []) => old.filter((m) => m.id !== matchId),
      )
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
    },
    onSettled: (_, _err, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
    },
  })
}

// ---------------------------------------------------------------------------
// 4. Daily Proof Submission & Review Hooks
// ---------------------------------------------------------------------------
export function useMatchProofs(matchId?: string) {
  return useQuery<ProofEntity[]>({
    queryKey: ["proofs", matchId],
    queryFn: () => api.get<ProofEntity[]>(`/api/proofs/match/${matchId}`),
    enabled: Boolean(matchId),
    refetchInterval: 1000 * 10,
  })
}

export function useSubmitProof() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      matchId: string
      day: number
      type?: "image" | "video"
      storageUrls: string[]
      comment?: string
    }) => api.post<ProofEntity>("/api/proofs", payload),
    onSuccess: (newProof, vars) => {
      if (newProof) {
        queryClient.setQueryData<ProofEntity[]>(["proofs", vars.matchId], (old = []) => {
          const exists = old.some((p) => p.day === vars.day && p.uploaderId === newProof.uploaderId)
          if (exists) {
            return old.map((p) => (p.day === vars.day && p.uploaderId === newProof.uploaderId ? newProof : p))
          }
          return [...old, newProof]
        })
      }
      queryClient.invalidateQueries({ queryKey: ["proofs", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["match", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["matches"] })
    },
  })
}

export function useReviewProof() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      proofId,
      status,
      rejectionReason,
    }: {
      proofId: string
      matchId: string
      status: "approved" | "rejected"
      rejectionReason?: string
    }) => api.post<ProofEntity>(`/api/proofs/${proofId}/review`, { status, rejectionReason }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["proofs", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["match", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
  })
}

// ---------------------------------------------------------------------------
// 5. In-Match Chat Hooks
// ---------------------------------------------------------------------------
export function useMatchMessages(matchId?: string, limit = 50, offset = 0) {
  return useQuery<MessageEntity[]>({
    queryKey: ["messages", matchId],
    queryFn: () =>
      api.get<MessageEntity[]>(`/api/messages/${matchId}`, {
        params: { limit, offset },
      }),
    enabled: Boolean(matchId),
    refetchInterval: 1000 * 2, // 2-second live chat polling
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      matchId,
      content,
      type = "text",
      storageUrl,
    }: {
      matchId: string
      content: string
      type?: "text" | "image" | "video"
      storageUrl?: string
    }) => api.post<MessageEntity>(`/api/messages/${matchId}`, { content, type, storageUrl }),

    onMutate: async (newMessage) => {
      // 1. Cancel ongoing refetches
      await queryClient.cancelQueries({ queryKey: ["messages", newMessage.matchId] })

      // 2. Snapshot previous messages
      const previousMessages = queryClient.getQueryData<MessageEntity[]>(["messages", newMessage.matchId]) || []

      // 3. Optimistically add message to UI immediately (0ms latency)
      const optimisticMessage: MessageEntity = {
        id: `temp-${Date.now()}`,
        matchId: newMessage.matchId,
        senderId: "me",
        content: newMessage.content,
        type: newMessage.type || "text",
        storageUrl: newMessage.storageUrl,
        sentAt: new Date().toISOString(),
      }

      queryClient.setQueryData<MessageEntity[]>(["messages", newMessage.matchId], (old = []) => [
        ...old,
        optimisticMessage,
      ])

      return { previousMessages, matchId: newMessage.matchId }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", context.matchId], context.previousMessages)
      }
    },

    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["messages", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["matches"] })
    },
  })
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => api.post(`/api/messages/${matchId}/read`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["messages", matchId] })
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

// ---------------------------------------------------------------------------
// 6. In-App Notifications Hooks
// ---------------------------------------------------------------------------
export function useNotifications() {
  return useQuery<{
    notifications: NotificationEntity[]
    unreadCount: number
  }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get<{
        notifications: (NotificationEntity & { read?: boolean; isRead?: boolean })[]
        unreadCount: number
      }>("/api/notifications")

      const normalized: NotificationEntity[] = (res?.notifications || []).map((n) => {
        const readStatus = Boolean(n.read ?? n.isRead)
        return {
          ...n,
          read: readStatus,
          isRead: readStatus,
        }
      })

      return {
        notifications: normalized,
        unreadCount: res?.unreadCount ?? normalized.filter((n) => !n.isRead).length,
      }
    },
    refetchInterval: 1000 * 30,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch(`/api/notifications/${notificationId}/read`),
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const prev = queryClient.getQueryData<{
        notifications: NotificationEntity[]
        unreadCount: number
      }>(["notifications"])

      if (prev) {
        const updated = prev.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true, isRead: true } : n,
        )
        queryClient.setQueryData(["notifications"], {
          notifications: updated,
          unreadCount: Math.max(0, updated.filter((n) => !n.isRead).length),
        })
      }

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["notifications"], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const prev = queryClient.getQueryData<{
        notifications: NotificationEntity[]
        unreadCount: number
      }>(["notifications"])

      if (prev) {
        const updated = prev.notifications.map((n) => ({
          ...n,
          read: true,
          isRead: true,
        }))
        queryClient.setQueryData(["notifications"], {
          notifications: updated,
          unreadCount: 0,
        })
      }

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["notifications"], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.delete(`/api/notifications/${notificationId}`),
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const prev = queryClient.getQueryData<{
        notifications: NotificationEntity[]
        unreadCount: number
      }>(["notifications"])

      if (prev) {
        const updated = prev.notifications.filter((n) => n.id !== notificationId)
        queryClient.setQueryData(["notifications"], {
          notifications: updated,
          unreadCount: Math.max(0, updated.filter((n) => !n.isRead).length),
        })
      }

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["notifications"], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useClearAllNotifications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        return await api.delete("/api/notifications/clear-all")
      } catch {
        try {
          return await api.post("/api/notifications/clear-all")
        } catch {
          // If clear-all is not yet deployed on remote server, fallback to mark-all-read so it doesn't fail
          return await api.post("/api/notifications/read-all")
        }
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] })
      const prev = queryClient.getQueryData<{
        notifications: NotificationEntity[]
        unreadCount: number
      }>(["notifications"])

      queryClient.setQueryData(["notifications"], {
        notifications: [],
        unreadCount: 0,
      })

      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["notifications"], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

// ---------------------------------------------------------------------------
// 7. Cloudflare R2 Media Upload Hooks
// ---------------------------------------------------------------------------
export function usePresignedUploadUrl() {
  return useMutation({
    mutationFn: (payload: {
      filename: string
      contentType: string
      folder?: "proofs" | "avatars" | "icons" | "messages" | "reports"
    }) =>
      api.post<{
        uploadUrl: string
        publicUrl: string
        key: string
      }>("/api/storage/presigned-url", payload),
  })
}

// ---------------------------------------------------------------------------
// 8. Support & Tickets Hooks
// ---------------------------------------------------------------------------
export function useMySupportChat() {
  return useQuery<{
    id: string
    userId: string
    lastMessage: string
    hasUnreadUser: boolean
  }>({
    queryKey: ["mySupportChat"],
    queryFn: () =>
      api.post<{
        id: string
        userId: string
        lastMessage: string
        hasUnreadUser: boolean
      }>("/api/support/my-chat"),
  })
}

export function useAdminSupportChats() {
  return useQuery<
    {
      id: string
      userId: string
      adminId?: string | null
      lastMessage: string
      updatedAt: string
      hasUnreadUser: boolean
      hasUnreadAdmin: boolean
      user?: {
        id: string
        name: string
        email: string
        avatarUrl?: string | null
      } | null
    }[]
  >({
    queryKey: ["adminSupportChats"],
    queryFn: () => api.get("/api/admin/support/chats"),
    refetchInterval: 1000 * 5,
  })
}

export function useAdminUsers(search?: string) {
  return useQuery<
    {
      id: string
      tokenIdentifier?: string | null
      name: string
      email: string
      avatarUrl?: string | null
      reputation: number
      appsCount: number
      isAdmin: boolean
      isGroupMember: boolean
      streak: number
      bestStreak: number
      createdAt: string
    }[]
  >({
    queryKey: ["adminUsers", search],
    queryFn: () =>
      api.get("/api/admin/users", {
        params: { search: search?.trim() || undefined },
      }),
  })
}

export function useGetOrCreateAdminUserChat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (targetUserId: string) =>
      api.post<{
        id: string
        userId: string
        adminId?: string | null
        lastMessage: string
      }>(`/api/admin/support/chats/user/${targetUserId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminSupportChats"] })
    },
  })
}

export function useAdminApps(search?: string, status?: string, limit = 50, offset = 0) {
  return useQuery<{
    apps: (AppEntity & { isDuplicate?: boolean })[]
    total: number
    duplicatePackagesCount: number
  }>({
    queryKey: ["adminApps", { search, status, limit, offset }],
    queryFn: () =>
      api.get("/api/admin/apps", {
        params: { search, status, limit, offset },
      }),
    refetchInterval: 1000 * 10,
  })
}

export function useAdminDeleteApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ appId, banPackage, reason }: { appId: string; banPackage?: boolean; reason?: string }) =>
      api.delete<{ message: string }>(`/api/admin/apps/${appId}`, {
        params: { banPackage: banPackage ? "true" : "false", reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApps"] })
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["adminStats"] })
    },
  })
}

export function useAdminCleanDuplicates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; deletedAppsCount: number; cleanedPackages: string[] }>(
        "/api/admin/apps/clean-duplicates",
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApps"] })
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["adminStats"] })
    },
  })
}

export function useAdminCleanAllApps() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; deletedAppsCount: number }>("/api/admin/apps/clean-all", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
      queryClient.invalidateQueries({ queryKey: ["adminStats"] })
      queryClient.invalidateQueries({ queryKey: ["adminApps"] })
    },
  })
}

export function useAdminCleanTestUsers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; deletedUsersCount: number }>("/api/admin/users/clean-test-users", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] })
      queryClient.invalidateQueries({ queryKey: ["adminStats"] })
      queryClient.invalidateQueries({ queryKey: ["adminSupportChats"] })
      queryClient.invalidateQueries({ queryKey: ["adminApps"] })
    },
  })
}

export function useAdminStats() {
  return useQuery<{
    totalUsers: number
    totalApps: number
    activeMatches: number
    totalProofs: number
    pendingReports: number
  }>({
    queryKey: ["adminStats"],
    queryFn: () => api.get("/api/admin/stats"),
    refetchInterval: 1000 * 15,
  })
}

export function useSupportChatDetails(chatId?: string) {
  return useQuery<{
    chat: { id: string; userId: string; lastMessage: string }
    messages: {
      id: string
      chatId: string
      senderId: string
      content: string
      type: "text" | "image"
      isAdmin: boolean
      sentAt: string
    }[]
  }>({
    queryKey: ["supportChat", chatId],
    queryFn: () => api.get(`/api/support/chats/${chatId}`),
    enabled: Boolean(chatId),
    refetchInterval: 1000 * 5,
  })
}

export function useSendSupportMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      chatId,
      content,
      type = "text",
    }: {
      chatId: string
      content: string
      type?: "text" | "image"
    }) => api.post(`/api/support/chats/${chatId}/messages`, { content, type }),

    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ["supportChat", newMessage.chatId] })
      const previousData = queryClient.getQueryData<any>(["supportChat", newMessage.chatId])
      const currentUser = queryClient.getQueryData<UserProfile>(["currentUser"])

      if (previousData) {
        const optimisticMsg = {
          id: `temp-${Date.now()}`,
          chatId: newMessage.chatId,
          senderId: currentUser?.id || "me",
          content: newMessage.content,
          type: newMessage.type || "text",
          isAdmin: Boolean(currentUser?.isAdmin),
          sentAt: new Date().toISOString(),
        }

        queryClient.setQueryData(["supportChat", newMessage.chatId], {
          ...previousData,
          messages: [...(previousData.messages || []), optimisticMsg],
        })
      }

      return { previousData, chatId: newMessage.chatId }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["supportChat", context.chatId], context.previousData)
      }
    },

    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["supportChat", vars.chatId] })
      queryClient.invalidateQueries({ queryKey: ["adminSupportChats"] })
      queryClient.invalidateQueries({ queryKey: ["mySupportChat"] })
    },
  })
}

// ---------------------------------------------------------------------------
// 9. Leaderboard Hooks
// ---------------------------------------------------------------------------
export function useLeaderboard(limit = 20) {
  return useQuery<{
    leaderboard: LeaderboardEntry[]
    cycleEnd: string | null
  }>({
    queryKey: ["leaderboard", limit],
    queryFn: () =>
      api.get<{ leaderboard: LeaderboardEntry[]; cycleEnd: string | null }>(
        "/api/leaderboard",
        { params: { limit } },
      ),
    staleTime: 1000 * 30,
  })
}

// ---------------------------------------------------------------------------
// 10. Reports & Moderation Hooks
// ---------------------------------------------------------------------------
export function useSubmitReport() {
  return useMutation({
    mutationFn: (payload: {
      type:
        | "dispute"
        | "app_spam"
        | "toxic_user"
        | "other"
        | "app_broken"
        | "app_not_visible"
        | "user_unresponsive"
      targetId: string
      matchId?: string
      reportedUserId?: string
      reportedAppId?: string
      description: string
      screenshots?: string[]
    }) => api.post("/api/reports", payload),
  })
}
