import React, { useState } from "react";
import { View, Pressable, ScrollView, Dimensions } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangleIcon, SendIcon } from "lucide-react-native";
import { useReviewProof } from "@/lib/api-hooks";
import { toast } from "@/lib/sonner";

interface RejectionReasonModalProps {
  visible: boolean;
  proofId: string | null;
  onClose: () => void;
  onRejected?: () => void;
}

const QUICK_REASONS = [
  "Screenshot is not clear",
  "Wrong app shown",
  "Not enough proof of usage",
  "Looks like a fake screenshot",
  "App not opened properly",
];

export function RejectionReasonModal({
  visible,
  proofId,
  onClose,
  onRejected,
}: RejectionReasonModalProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reviewProofMutation = useReviewProof();

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      toast.error("Reason too short", {
        description: "Please provide a reason with at least 10 characters",
      });
      return;
    }

    if (!proofId) return;

    setIsSubmitting(true);
    try {
      await reviewProofMutation.mutateAsync({
        proofId,
        matchId: "",
        status: "rejected",
        rejectionReason: reason.trim(),
      });
      setReason("");
      toast.success("Proof rejected", {
        description: "Your partner has been notified with your feedback.",
      });
      onClose();
      onRejected?.();
    } catch (error: any) {
      toast.error("Failed to reject proof", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <View className="flex-row items-center gap-2">
            <Icon as={AlertTriangleIcon} className="text-destructive size-5" />
            <DialogTitle>Reject Proof</DialogTitle>
          </View>
        </DialogHeader>

        <ScrollView
          style={{ maxHeight: Dimensions.get("window").height * 0.55 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <Text className="text-sm text-muted-foreground">
              Provide a reason so your partner understands what went wrong.
            </Text>

            <Text className="text-xs font-semibold text-muted-foreground">
              Quick reasons:
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {QUICK_REASONS.map((quickReason, index) => {
                const isSelected = reason === quickReason;
                return (
                  <Pressable
                    key={index}
                    onPress={() => setReason(quickReason)}
                    className={`px-3 py-1.5 rounded-full border ${
                      isSelected
                        ? "bg-destructive border-destructive"
                        : "bg-secondary border-border"
                    }`}
                  >
                    <Text
                      className={`text-xs ${
                        isSelected
                          ? "text-destructive-foreground font-semibold"
                          : "text-secondary-foreground"
                      }`}
                    >
                      {quickReason}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-xs font-semibold text-muted-foreground">
              Or write your own:
            </Text>
            <Textarea
              placeholder="Explain why you're rejecting this proof..."
              value={reason}
              onChangeText={setReason}
              className="min-h-[80px]"
            />

            <Text
              className={`text-xs ${
                reason.length < 10 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {reason.length}/10 minimum characters
            </Text>
          </View>
        </ScrollView>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              <Text>Cancel</Text>
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onPress={handleSubmit}
            disabled={isSubmitting || reason.trim().length < 10}
          >
            <Icon as={SendIcon} className="text-white size-4 mr-1.5" />
            <Text>{isSubmitting ? "Submitting..." : "Submit Rejection"}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
