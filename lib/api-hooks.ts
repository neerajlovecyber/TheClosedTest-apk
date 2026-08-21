/**
 * React Query Hooks for TheClosedTest
 * Typed data hooks replacing Convex useQuery & useMutation across mobile screens.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "./api"

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
  status: "pending" | "active" | "completed" | "cancelled"
  startDate?: string | null
  completedAt?: string | null
  user1ApprovedCount: number
  user2ApprovedCount: number
  user1LastProof?: MatchSummaryProof | null
  user2LastProof?: MatchSummaryProof | null
  lastActivity: string
  createdAt: string
  app1?: AppEntity
  app2?: AppEntity
  user1?: UserProfile
  user2?: UserProfile
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
  isRead: boolean
  createdAt: string
}

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
        return await api.get<UserProfile>("/api/users/me")
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

// ---------------------------------------------------------------------------
// 2. Apps Feed & Management Hooks
// ---------------------------------------------------------------------------
export function useRecruitingApps(search?: string, limit = 20, offset = 0) {
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
export function useMatches(status?: "all" | "pending" | "active" | "completed") {
  return useQuery<MatchEntity[]>({
    queryKey: ["matches", status || "all"],
    queryFn: () =>
      api.get<MatchEntity[]>("/api/matches", {
        params: status && status !== "all" ? { status } : undefined,
      }),
    refetchInterval: 1000 * 15, // Polling interval for live match updates
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
    mutationFn: (payload: { myAppId: string; targetAppId: string }) =>
      api.post<MatchEntity>("/api/matches/request", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["myApps"] })
    },
  })
}

export function useAcceptMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => api.post<MatchEntity>(`/api/matches/${matchId}/accept`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
    },
  })
}

export function useRejectMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (matchId: string) => api.post<MatchEntity>(`/api/matches/${matchId}/reject`),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] })
      queryClient.invalidateQueries({ queryKey: ["match", matchId] })
    },
  })
}

// ---------------------------------------------------------------------------
// 4. Proof Upload & Review Hooks
// ---------------------------------------------------------------------------
export function useMatchProofs(matchId?: string) {
  return useQuery<ProofEntity[]>({
    queryKey: ["proofs", matchId],
    queryFn: () => api.get<ProofEntity[]>(`/api/proofs/match/${matchId}`),
    enabled: Boolean(matchId),
    refetchInterval: 1000 * 15,
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["proofs", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["match", vars.matchId] })
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
    refetchInterval: 1000 * 4, // 4-second chat polling
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["messages", vars.matchId] })
      queryClient.invalidateQueries({ queryKey: ["matches"] })
    },
  })
}

export function useMarkMessagesRead() {
  return useMutation({
    mutationFn: (matchId: string) => api.post(`/api/messages/${matchId}/read`),
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
    queryFn: () =>
      api.get<{
        notifications: NotificationEntity[]
        unreadCount: number
      }>("/api/notifications"),
    refetchInterval: 1000 * 30,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch(`/api/notifications/${notificationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => {
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["supportChat", vars.chatId] })
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
