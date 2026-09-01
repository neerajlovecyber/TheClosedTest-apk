import React, { useState } from "react";
import { View, Pressable, Platform } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { toast } from "@/lib/sonner";
import { Icon } from "@/components/ui/icon";
import { ArrowLeftIcon } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMySupportChat, useSendSupportMessage } from "@/lib/api-hooks";
import { cn } from "@/lib/utils";

export default function CreateTicketScreen() {
  const router = useRouter();
  const { data: myChat } = useMySupportChat();
  const sendMessageMutation = useSendSupportMessage();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!myChat?.id) {
      toast.error("Support chat unavailable");
      return;
    }

    setSubmitting(true);
    try {
      const formattedMessage = `[${priority.toUpperCase()} PRIORITY] Subject: ${subject.trim()}\n\n${message.trim()}`;
      await sendMessageMutation.mutateAsync({
        chatId: myChat.id,
        content: formattedMessage,
        type: "text",
      });
      toast.success("Ticket message sent successfully");
      router.replace("/admin-chat" as any);
    } catch (error: any) {
      toast.error("Failed to create ticket", { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="mr-3 p-1">
          <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground">New Support Ticket</Text>
      </View>

      <KeyboardAwareScrollView bottomOffset={Platform.OS === "ios" ? 100 : 80} className="flex-1 p-6">
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Subject</Text>
          <Input
            placeholder="Brief summary of issue..."
            value={subject}
            onChangeText={setSubject}
          />
        </View>

        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Priority</Text>
          <View className="flex-row gap-3">
            {(["low", "medium", "high"] as const).map((p) => {
              const isSelected = priority === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  className={cn(
                    "flex-1 py-3 items-center rounded-xl border",
                    isSelected ? "bg-primary border-primary" : "bg-card border-border",
                  )}
                >
                  <Text
                    className={cn(
                      "font-semibold capitalize",
                      isSelected ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-sm font-semibold text-foreground mb-2">Message</Text>
          <Textarea
            placeholder="Describe your issue in detail..."
            value={message}
            onChangeText={setMessage}
            className="min-h-[150px]"
          />
        </View>

        <Button size="lg" onPress={handleSubmit} disabled={submitting} className="w-full">
          <Text className="font-bold text-primary-foreground">
            {submitting ? "Creating Ticket..." : "Submit Ticket"}
          </Text>
        </Button>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
