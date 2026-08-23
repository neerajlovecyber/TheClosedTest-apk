import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { HeadphonesIcon, InfoIcon, XIcon, LayersIcon, StarIcon, FlameIcon, CheckCircleIcon } from "lucide-react-native";
import { toast } from "@/lib/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser, useMySupportChat, useSupportChatDetails, useSendSupportMessage, useAdminUserDetails } from "@/lib/api-hooks";
import { ChatView, ChatMessageItem } from "@/components/ChatView";
import { AppCard } from "@/components/AppCard";
import { View, TouchableOpacity, Modal, ScrollView, Image, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const SUPPORT_QUICK_CHIPS = [
  "📸 Issue with proof approval",
  "❓ How do 14 days of testing work?",
  "🐛 Found a bug in the app",
  "🛡️ Need help with partner match",
];

export default function AdminChatScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { chatId, userName, userId } = useLocalSearchParams<{
    chatId?: string;
    userName?: string;
    userId?: string;
  }>();

  const { data: currentUser } = useCurrentUser();
  const { data: myChat } = useMySupportChat();
  const effectiveChatId = chatId || myChat?.id;

  const { data: chatData, isLoading } = useSupportChatDetails(effectiveChatId);
  const sendMessageMutation = useSendSupportMessage();

  const targetUserId = userId || chatData?.chat?.userId;
  const isTargetUserAdmin = Boolean(currentUser?.isAdmin && targetUserId && targetUserId !== currentUser?.id);
  const { data: userContext, isLoading: isUserContextLoading } = useAdminUserDetails(isTargetUserAdmin ? targetUserId : undefined);

  const [showInfoModal, setShowInfoModal] = useState(false);

  // Mark conversation read and refresh query lists
  useEffect(() => {
    if (effectiveChatId) {
      queryClient.setQueryData<any>(["mySupportChat"], (old: any) => (old ? { ...old, hasUnreadUser: false } : old));
      queryClient.invalidateQueries({ queryKey: ["adminSupportChats"] });
      queryClient.invalidateQueries({ queryKey: ["mySupportChat"] });
    }
  }, [effectiveChatId, queryClient]);

  const messages = chatData?.messages || [];

  const formattedMessages = useMemo<ChatMessageItem[]>(() => {
    const isAdminUser = Boolean(currentUser?.isAdmin);
    const chat = chatData?.chat;
    return messages.map((msg: any) => {
      const isMe = isAdminUser
        ? Boolean(msg.isAdmin) || msg.senderRole === "admin" || msg.senderId === currentUser?.id
        : !msg.isAdmin && msg.senderRole !== "admin";

      const isFromAdmin = Boolean(msg.isAdmin) || msg.senderRole === "admin";
      const isSeen = isMe ? (isAdminUser ? !chat?.hasUnreadUser : !chat?.hasUnreadAdmin) : false;

      return {
        id: msg.id,
        content: msg.content,
        sentAt: msg.sentAt,
        isMe,
        isSeen,
        isOptimistic: String(msg.id).startsWith("temp-"),
        senderBadge: !isMe && isFromAdmin ? "Support Team" : undefined,
      };
    });
  }, [messages, currentUser?.isAdmin, currentUser?.id, chatData?.chat]);

  const handleSend = async (text: string) => {
    try {
      if (currentUser?.isAdmin && userId) {
        await api.post(`/admin/support/chats/${userId}/messages`, {
          content: text,
        });
      } else {
        await sendMessageMutation.mutateAsync({
          chatId: effectiveChatId!,
          content: text,
          type: "text",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["adminSupportChat", userId] });
      queryClient.invalidateQueries({ queryKey: ["mySupportChat"] });
    } catch {
      toast.error("Failed to send message");
    }
  };

  const rightAction = isTargetUserAdmin ? (
    <TouchableOpacity
      onPress={() => setShowInfoModal(true)}
      activeOpacity={0.7}
      className="p-2 rounded-full bg-secondary/80 active:bg-secondary border border-border/50"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel="View User Apps & Context"
    >
      <Icon as={InfoIcon} size={20} className="text-primary" />
    </TouchableOpacity>
  ) : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatView
        title={userName ? `Support: ${userName}` : "Official Support"}
        subtitle={userName ? "User Support Ticket" : "Direct chat with admins"}
        onBack={() => router.back()}
        rightAction={rightAction}
        messages={formattedMessages}
        isLoading={isLoading}
        emptyTitle="Direct Support Chat"
        emptyDescription="Have questions about testers, proofs, or apps? Ask anything below and our team will respond."
        emptyIcon={HeadphonesIcon}
        quickChips={!currentUser?.isAdmin ? SUPPORT_QUICK_CHIPS : []}
        quickChipsLabel="Topics:"
        placeholder="Type a message to support..."
        onSend={handleSend}
        isSending={sendMessageMutation.isPending}
      />

      {/* Admin User Info & App Cards Modal */}
      <Modal visible={showInfoModal} animationType="slide" transparent onRequestClose={() => setShowInfoModal(false)}>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-card rounded-t-3xl max-h-[85%] border-t border-border shadow-2xl">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-border/50">
              <View className="flex-row items-center gap-2">
                <View className="p-2 rounded-xl bg-primary/10">
                  <Icon as={LayersIcon} className="size-5 text-primary" />
                </View>
                <View>
                  <Text className="text-lg font-bold text-foreground">User Apps & Profile</Text>
                  <Text className="text-xs text-muted-foreground">Context for support investigation</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowInfoModal(false)}
                className="p-2 rounded-full bg-secondary/60 active:bg-secondary"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon as={XIcon} className="size-5 text-muted-foreground" />
              </TouchableOpacity>
            </View>

            <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 32 }}>
              {isUserContextLoading ? (
                <View className="py-12 items-center justify-center">
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text className="text-xs text-muted-foreground mt-2">Loading user data...</Text>
                </View>
              ) : userContext ? (
                <View className="gap-4">
                  {/* User Profile Summary Card */}
                  <Card className="border-border/60 bg-secondary/30">
                    <CardContent className="p-4 gap-3">
                      <View className="flex-row items-center gap-3">
                        {userContext.user.avatarUrl ? (
                          <Image source={{ uri: userContext.user.avatarUrl }} className="w-12 h-12 rounded-full border border-border" />
                        ) : (
                          <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center border border-border">
                            <Text className="text-lg font-bold text-primary">{userContext.user.name?.[0] || "U"}</Text>
                          </View>
                        )}
                        <View className="flex-1">
                          <Text className="text-base font-bold text-foreground">{userContext.user.name || "Developer"}</Text>
                          <Text className="text-xs text-muted-foreground">{userContext.user.email}</Text>
                        </View>
                      </View>

                      {/* User Stats Chips */}
                      <View className="flex-row flex-wrap gap-2 pt-2 border-t border-border/40">
                        <View className="flex-row items-center gap-1.5 bg-card px-2.5 py-1 rounded-lg border border-border/40">
                          <Icon as={StarIcon} size={14} className="text-amber-500" />
                          <Text className="text-xs font-semibold text-foreground">{userContext.user.reputation} Rep</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5 bg-card px-2.5 py-1 rounded-lg border border-border/40">
                          <Icon as={FlameIcon} size={14} className="text-orange-500" />
                          <Text className="text-xs font-semibold text-foreground">{userContext.user.streak}d Streak</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5 bg-card px-2.5 py-1 rounded-lg border border-border/40">
                          <Text className="text-xs font-semibold text-foreground">{userContext.activeMatchesCount} Active Tests</Text>
                        </View>
                        {userContext.user.isGroupMember && (
                          <View className="flex-row items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                            <Icon as={CheckCircleIcon} size={13} className="text-emerald-600 dark:text-emerald-400" />
                            <Text className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Google Group</Text>
                          </View>
                        )}
                      </View>
                    </CardContent>
                  </Card>

                  {/* Registered Apps Section */}
                  <View className="gap-2 mt-1">
                    <Text className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 mb-1">
                      Registered Apps ({userContext.apps.length})
                    </Text>

                    {userContext.apps.length === 0 ? (
                      <View className="p-6 bg-secondary/30 rounded-2xl items-center justify-center border border-dashed border-border">
                        <Text className="text-sm font-medium text-muted-foreground">No registered apps found for this user.</Text>
                      </View>
                    ) : (
                      userContext.apps.map((app) => (
                        <AppCard
                          key={app.id}
                          item={{
                            _id: app.id,
                            title: app.title,
                            iconUrl: app.iconUrl,
                            currentTesters: app.currentTesters,
                            requiredTesters: app.requiredTesters,
                            status: app.status,
                            ownerName: userContext.user.name || undefined,
                            ownerEmail: userContext.user.email || undefined,
                            reputation: userContext.user.reputation,
                          }}
                          variant="my-app"
                          onPress={() => {
                            setShowInfoModal(false);
                            router.push(`/app-details/${app.id}` as any);
                          }}
                        />
                      ))
                    )}
                  </View>
                </View>
              ) : (
                <View className="py-8 items-center justify-center">
                  <Text className="text-sm text-muted-foreground">Could not load user context.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
