import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { View, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { LinkableText } from "@/components/ui/LinkableText";
import { ArrowLeftIcon, SendIcon, CheckIcon, CheckCheckIcon, ClockIcon, MessageSquareIcon, SparklesIcon, ShieldIcon, LucideIcon } from "lucide-react-native";

export interface ChatMessageItem {
  id: string;
  content: string;
  sentAt: string | Date;
  isMe: boolean;
  isOptimistic?: boolean;
  isSeen?: boolean;
  senderBadge?: string;
}

interface ChatListItem {
  id: string;
  type: "message" | "date";
  dateText?: string;
  data?: ChatMessageItem;
}

export interface ChatViewProps {
  title: string;
  subtitle?: string;
  avatarText?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  messages: ChatMessageItem[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  quickChips?: string[];
  quickChipsLabel?: string;
  placeholder?: string;
  onSend: (text: string) => Promise<void> | void;
  isSending?: boolean;
}

export function ChatView({
  title,
  subtitle,
  avatarText,
  onBack,
  rightAction,
  messages,
  isLoading = false,
  emptyTitle = "No messages yet",
  emptyDescription = "Send a message to start the conversation.",
  emptyIcon: EmptyIcon = MessageSquareIcon,
  quickChips = [],
  quickChipsLabel = "Quick:",
  placeholder = "Type a message...",
  onSend,
  isSending = false,
}: ChatViewProps) {
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const [newMessage, setNewMessage] = useState("");
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<any>(null);

  // Group messages chronologically with date dividers, reversed for inverted list (index 0 = newest at bottom)
  const chatItems = useMemo<ChatListItem[]>(() => {
    if (!messages || messages.length === 0) return [];

    const sorted = [...messages].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

    const items: ChatListItem[] = [];
    let lastDateStr = "";

    sorted.forEach((msg) => {
      const msgDate = new Date(msg.sentAt);
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      const dateStr = msgDate.toDateString();

      if (dateStr !== lastDateStr) {
        let label = msgDate.toLocaleDateString([], { month: "short", day: "numeric" });
        if (dateStr === todayStr) label = "Today";
        else if (dateStr === yesterdayStr) label = "Yesterday";

        items.push({ id: `date-${dateStr}`, type: "date", dateText: label });
        lastDateStr = dateStr;
      }

      items.push({ id: msg.id, type: "message", data: msg });
    });

    return items.reverse();
  }, [messages]);

  // Robust bottom scroll helper for inverted list (offset 0 and index 0)
  const scrollToBottom = useCallback((animated = true) => {
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    } catch {}
    try {
      listRef.current?.scrollToIndex({ index: 0, animated });
    } catch {}
  }, []);

  // Snap to bottom when messages update
  useEffect(() => {
    if (chatItems.length > 0) {
      const timer = setTimeout(() => scrollToBottom(true), 50);
      return () => clearTimeout(timer);
    }
  }, [chatItems.length, scrollToBottom]);

  // Snap to bottom when keyboard opens so latest message is not covered
  useEffect(() => {
    if (isKeyboardVisible && chatItems.length > 0) {
      const timer = setTimeout(() => scrollToBottom(true), 80);
      return () => clearTimeout(timer);
    }
  }, [isKeyboardVisible, chatItems.length, scrollToBottom]);

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || newMessage).trim();
    if (!textToSend || isSending) return;

    if (!customText) {
      setNewMessage("");
    }

    try {
      await onSend(textToSend);
      setTimeout(() => scrollToBottom(true), 60);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const renderItem = ({ item }: { item: ChatListItem }) => {
    if (item.type === "date") {
      return (
        <View style={{ width: "100%", alignItems: "center", marginVertical: 12 }}>
          <View className="bg-secondary px-3 py-1 rounded-full border border-border">
            <Text className="text-[11px] font-medium text-muted-foreground">{item.dateText}</Text>
          </View>
        </View>
      );
    }

    const msg = item.data;
    if (!msg) return null;

    const isMe = Boolean(msg.isMe);

    return (
      <View
        style={{
          width: "100%",
          alignItems: isMe ? "flex-end" : "flex-start",
          marginBottom: 10,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            maxWidth: "82%",
            alignSelf: isMe ? "flex-end" : "flex-start",
          }}
          className={`px-4 py-2.5 rounded-2xl ${isMe ? "bg-primary rounded-tr-xs" : "bg-secondary rounded-tl-xs border border-border"}`}
        >
          {msg.senderBadge && (
            <View className="flex-row items-center gap-1 mb-1">
              <Icon as={ShieldIcon} className="text-primary size-3" />
              <Text className="text-[11px] font-bold text-primary">{msg.senderBadge}</Text>
            </View>
          )}
          <LinkableText
            text={msg.content}
            className={`text-[15px] leading-5 ${isMe ? "text-primary-foreground font-medium" : "text-foreground"}`}
            linkClassName={isMe ? "text-primary-foreground underline font-semibold" : "text-primary underline font-semibold"}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
              justifyContent: isMe ? "flex-end" : "flex-start",
            }}
          >
            <Text className={`text-[10px] ${isMe ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
              {new Date(msg.sentAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {isMe && (
              <Icon
                as={msg.isOptimistic ? ClockIcon : msg.isSeen ? CheckCheckIcon : CheckIcon}
                className={`size-3.5 ${msg.isOptimistic ? "text-primary-foreground/50" : msg.isSeen ? "text-sky-300" : "text-primary-foreground/70"}`}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  const isButtonActive = Boolean(newMessage.trim()) && !isSending;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      {/* Pinned Top Header */}
      <View className="px-4 py-3 border-b border-border bg-card flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <Pressable onPress={onBack} className="mr-3 p-1.5 rounded-full" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
          </Pressable>
          {avatarText && (
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20 mr-3">
              <Text className="text-primary font-bold text-base">{avatarText}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        {rightAction}
      </View>

      {/* Keyboard Avoiding Container */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0} className="flex-1">
        {/* Messages List */}
        {isLoading && chatItems.length === 0 ? (
          <View className="flex-1 items-center justify-center p-6">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="text-xs text-muted-foreground mt-2">Loading conversation...</Text>
          </View>
        ) : chatItems.length === 0 ? (
          <View className="flex-1 items-center justify-center p-6 text-center">
            <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-3">
              <Icon as={EmptyIcon} className="text-primary size-7" />
            </View>
            <Text className="text-base font-bold text-foreground mb-1">{emptyTitle}</Text>
            <Text className="text-xs text-muted-foreground text-center max-w-[260px] mb-4">{emptyDescription}</Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={chatItems}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingTop: 14, paddingBottom: 16 }}
            className="flex-1"
          />
        )}

        {/* Quick Action Suggestion Chips */}
        {quickChips.length > 0 && (
          <View className="px-3 py-2 border-t border-border bg-card">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", paddingRight: 16 }}>
              <View className="flex-row items-center gap-1 mr-2">
                <Icon as={SparklesIcon} className="text-primary size-3.5" />
                <Text className="text-[11px] font-semibold text-primary">{quickChipsLabel}</Text>
              </View>
              {quickChips.map((chip, idx) => (
                <Pressable key={idx} onPress={() => handleSend(chip)} className="px-3 py-1.5 bg-secondary mr-2 rounded-full border border-border">
                  <Text className="text-xs text-foreground font-medium">{chip}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom Input Composer */}
        <View
          style={{
            paddingBottom: isKeyboardVisible ? 8 : Math.max(insets.bottom, 10),
          }}
          className="p-3 bg-background border-t border-border flex-row items-center gap-2"
        >
          <TextInput
            ref={inputRef}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            className="flex-1 bg-secondary text-foreground px-4 py-2.5 rounded-2xl text-base max-h-24"
            returnKeyType="send"
            multiline
            onSubmitEditing={() => handleSend()}
          />
          <Pressable
            onPress={() => handleSend()}
            disabled={!isButtonActive}
            className={`w-11 h-11 rounded-2xl items-center justify-center ${isButtonActive ? "bg-primary" : "bg-muted"}`}
          >
            <Icon as={SendIcon} className={isButtonActive ? "text-primary-foreground size-5" : "text-muted-foreground size-5"} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
