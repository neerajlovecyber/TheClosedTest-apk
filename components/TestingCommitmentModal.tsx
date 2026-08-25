import React from "react";
import { View, Modal, Pressable, TouchableOpacity, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  XIcon,
  CameraIcon,
  ClockIcon,
  CheckCircle2Icon,
  SparklesIcon,
} from "lucide-react-native";

interface TestingCommitmentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export function TestingCommitmentModal({
  visible,
  onClose,
  onConfirm,
  isSubmitting = false,
}: TestingCommitmentModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/60 justify-center items-center p-4">
        <Pressable className="absolute inset-0" onPress={onClose} disabled={isSubmitting} />

        <View className="w-full max-w-sm bg-background rounded-3xl p-5 border border-border shadow-2xl z-10">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-border/60">
            <View className="flex-row items-center gap-2">
              <Icon as={SparklesIcon} className="size-5 text-primary" />
              <Text className="text-lg font-bold text-foreground">
                Before You Start
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              className="w-7 h-7 rounded-full bg-secondary items-center justify-center active:bg-secondary/80"
            >
              <Icon as={XIcon} className="size-4 text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* 3 Simple, Short Points */}
          <View className="py-4 gap-3">
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-xl bg-blue-500/10 items-center justify-center">
                <Icon as={CameraIcon} className="size-4 text-blue-600 dark:text-blue-400" />
              </View>
              <Text className="flex-1 text-sm text-foreground">
                <Text className="font-bold">Upload daily: </Text>
                Submit 1 screenshot every day for 14 days.
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-xl bg-orange-500/10 items-center justify-center">
                <Icon as={ClockIcon} className="size-4 text-orange-600 dark:text-orange-400" />
              </View>
              <Text className="flex-1 text-sm text-foreground">
                <Text className="font-bold text-orange-600 dark:text-orange-400">3-day rule: </Text>
                Missing 3 days in a row cancels the test.
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-xl bg-green-500/10 items-center justify-center">
                <Icon as={CheckCircle2Icon} className="size-4 text-green-600 dark:text-green-400" />
              </View>
              <Text className="flex-1 text-sm text-foreground">
                <Text className="font-bold">Review: </Text>
                Approve your partner's daily uploads promptly.
              </Text>
            </View>
          </View>

          {/* Action Button */}
          <View className="pt-2 border-t border-border/60">
            <Button
              size="lg"
              className="w-full rounded-xl bg-primary"
              onPress={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#fff" />
                  <Text className="font-bold text-primary-foreground">Sending...</Text>
                </View>
              ) : (
                <Text className="font-bold text-primary-foreground">
                  I Agree & Start
                </Text>
              )}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
