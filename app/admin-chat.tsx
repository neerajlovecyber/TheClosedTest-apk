import React, { useEffect, useMemo } from "react";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { HeadphonesIcon } from "lucide-react-native";
import { toast } from "@/lib/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser, useMySupportChat, useSupportChatDetails, useSendSupportMessage } from "@/lib/api-hooks";
import { ChatView, ChatMessageItem } from "@/components/ChatView";

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

  // Mark conversation read and refresh query lists
  useEffect(() => {
    if (effectiveChatId) {
      queryClient.invalidateQueries({ queryKey: ["adminSupportChats"] });
      queryClient.invalidateQueries({ queryKey: ["mySupportChat"] });
    }
  }, [effectiveChatId, queryClient]);

  const messages = chatData?.messages || [];

  const formattedMessages = useMemo<ChatMessageItem[]>(() => {
    const isAdminUser = Boolean(currentUser?.isAdmin);
    return messages.map((msg: any) => {
      // Correctly identify if the message is from me vs the other party
      const isMe = isAdminUser
        ? Boolean(msg.isAdmin) || msg.senderRole === "admin" || msg.senderId === currentUser?.id
        : !msg.isAdmin && msg.senderRole !== "admin";

      const isFromAdmin = Boolean(msg.isAdmin) || msg.senderRole === "admin";

      return {
        id: msg.id,
        content: msg.content,
        sentAt: msg.sentAt,
        isMe,
        isOptimistic: String(msg.id).startsWith("temp-"),
        senderBadge: !isMe && isFromAdmin ? "Support Team" : undefined,
      };
    });
  }, [messages, currentUser?.isAdmin, currentUser?.id]);

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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatView
        title={userName ? `Support: ${userName}` : "Official Support"}
        subtitle={userName ? "User Support Ticket" : "Direct chat with admins"}
        onBack={() => router.back()}
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
    </>
  );
}
