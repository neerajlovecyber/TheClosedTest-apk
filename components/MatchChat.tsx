import React, { useEffect, useMemo } from "react";
import { Modal, TouchableOpacity } from "react-native";
import { Icon } from "@/components/ui/icon";
import { FlagIcon } from "lucide-react-native";
import { ChatView, ChatMessageItem } from "@/components/ChatView";
import { useMatchMessages, useSendMessage, useMarkMessagesRead, useCurrentUser } from "@/lib/api-hooks";

interface MatchChatProps {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  partnerName: string;
  onReport?: () => void;
  currentUserId?: string;
  partnerLastRead?: string | Date | null;
}

const QUICK_CHIPS = ["📸 Uploaded today's proof!", "✅ Approved your proof!", "🔔 Daily reminder to test", "👋 Hey, ready to test today!"];

export function MatchChat({ visible, onClose, matchId, partnerName, onReport, currentUserId, partnerLastRead }: MatchChatProps) {
  const { data: currentUser } = useCurrentUser();
  const myUserId = currentUserId || currentUser?.id;

  const { data: messages = [], isLoading } = useMatchMessages(matchId);
  const sendMessageMutation = useSendMessage();
  const markAsReadMutation = useMarkMessagesRead();

  useEffect(() => {
    if (visible && matchId) {
      markAsReadMutation.mutateAsync(matchId).catch(() => {});
    }
  }, [visible, matchId]);

  const formattedMessages = useMemo<ChatMessageItem[]>(() => {
    return messages.map((msg) => {
      const isMe = myUserId ? msg.senderId === myUserId || msg.senderId === "me" : msg.senderId === "me";
      const isSeen = Boolean(partnerLastRead && new Date(partnerLastRead).getTime() >= new Date(msg.sentAt).getTime());
      return {
        id: msg.id,
        content: msg.content,
        sentAt: msg.sentAt,
        isMe,
        isOptimistic: String(msg.id).startsWith("temp-"),
        isSeen,
      };
    });
  }, [messages, myUserId, partnerLastRead]);

  const handleSend = async (text: string) => {
    await sendMessageMutation.mutateAsync({
      matchId,
      content: text,
      type: "text",
    });
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} statusBarTranslucent animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <ChatView
        title={partnerName}
        avatarText={partnerName ? partnerName[0].toUpperCase() : "P"}
        onBack={onClose}
        rightAction={
          onReport ? (
            <TouchableOpacity onPress={onReport} className="p-2 rounded-full active:bg-secondary">
              <Icon as={FlagIcon} className="text-destructive size-5" />
            </TouchableOpacity>
          ) : undefined
        }
        messages={formattedMessages}
        isLoading={isLoading}
        emptyTitle="No messages yet"
        emptyDescription="Coordinate testing or send daily reminders with your peer tester here."
        quickChips={QUICK_CHIPS}
        onSend={handleSend}
        isSending={sendMessageMutation.isPending}
      />
    </Modal>
  );
}
