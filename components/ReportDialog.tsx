import React, { useState } from "react";
import { View, Pressable } from "react-native";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/lib/sonner";
import { useSubmitReport } from "@/lib/api-hooks";

interface ReportDialogProps {
  visible: boolean;
  onClose: () => void;
  reportType: "user" | "app" | "match";
  targetId: string;
  matchId?: string;
  reportedUserId?: string;
  reportedAppId?: string;
  targetName: string;
}

export function ReportDialog({
  visible,
  onClose,
  reportType,
  targetId,
  matchId,
  reportedUserId,
  reportedAppId,
  targetName,
}: ReportDialogProps) {
  const appReportTypes = [
    {
      value: "app_not_visible" as const,
      label: "App Inaccessible or Broken Link",
      description: "Google Group closed, Play Store 404, or country restricted",
    },
    {
      value: "app_spam" as const,
      label: "Spam, Fake or Harmful App",
      description: "Malicious APK, deceptive listing, or scam",
    },
  ];

  const matchReportTypes = [
    {
      value: "user_unresponsive" as const,
      label: "Partner Inactive",
      description: "Tester stopped submitting proofs (auto-cancelled after 72h)",
    },
  ];

  const reportTypes = reportType === "app" ? appReportTypes : matchReportTypes;

  const [selectedType, setSelectedType] = useState<
    "app_not_visible" | "app_spam" | "user_unresponsive"
  >(reportType === "app" ? "app_not_visible" : "user_unresponsive");
  const [submitting, setSubmitting] = useState(false);

  const submitReportMutation = useSubmitReport();

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitReportMutation.mutateAsync({
        type: selectedType,
        targetId,
        matchId: matchId ?? undefined,
        reportedUserId: reportedUserId ?? undefined,
        reportedAppId: reportedAppId ?? undefined,
      });
      toast.success("Report submitted successfully");
      onClose();
    } catch (error: any) {
      toast.error("Failed to submit report", { description: error.message });
    } finally {
      setSubmitting(false);
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
          <DialogTitle>
            Report {reportType === "app" ? "App" : "Issue"}
          </DialogTitle>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {targetName}
          </Text>
        </DialogHeader>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">
            Select Reason
          </Text>
          <RadioGroup
            value={selectedType}
            onValueChange={(val) =>
              setSelectedType(val as "app_not_visible" | "app_spam" | "user_unresponsive")
            }
            className="gap-2"
          >
            {reportTypes.map((type) => {
              const isSelected = selectedType === type.value;
              return (
                <Pressable
                  key={type.value}
                  onPress={() => setSelectedType(type.value)}
                  className={`flex-row items-center justify-between p-3.5 rounded-xl border ${
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <View className="flex-1 mr-3">
                    <Text className="font-semibold text-foreground text-sm">
                      {type.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">
                      {type.description}
                    </Text>
                  </View>
                  <RadioGroupItem value={type.value} />
                </Pressable>
              );
            })}
          </RadioGroup>
        </View>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              <Text>Cancel</Text>
            </Button>
          </DialogClose>
          <Button onPress={handleSubmit} disabled={submitting}>
            <Text>{submitting ? "Submitting..." : "Submit Report"}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
