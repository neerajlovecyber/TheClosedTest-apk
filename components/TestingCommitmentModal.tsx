import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import {
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
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <View className="flex-row items-center gap-2">
            <Icon as={SparklesIcon} className="size-5 text-primary" />
            <DialogTitle>Before You Start</DialogTitle>
          </View>
        </DialogHeader>

        <View className="gap-3">
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

        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
