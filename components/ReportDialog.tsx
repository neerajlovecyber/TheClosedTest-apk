import React, { useState } from "react";
import { View, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { XIcon } from "lucide-react-native";
import { toast } from "@/lib/sonner";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export function ReportDialog({ visible, onClose, reportType, targetId, matchId, reportedUserId, reportedAppId, targetName }: ReportDialogProps) {
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

  const [selectedType, setSelectedType] = useState<"app_not_visible" | "app_spam" | "user_unresponsive">(
    reportType === "app" ? "app_not_visible" : "user_unresponsive",
  );
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();

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
      toast.success("Report submitted successfully", {
        description: reportType === "app" ? "Community reports help keep marketplace apps working." : undefined,
      });
      onClose();
    } catch (error: any) {
      toast.error("Failed to submit report", { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-background rounded-t-3xl max-h-[85%]">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-bold text-foreground">Report {reportType === "user" ? "User" : reportType === "app" ? "App" : "Issue"}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                {targetName}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1.5">
              <Icon as={XIcon} className="text-muted-foreground size-5" />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="p-6"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            <Text className="text-sm font-semibold text-foreground mb-3">Select Reason</Text>
            <View className="gap-0 mb-4 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              {reportTypes.map((type, index) => (
                <TouchableOpacity
                  key={type.value}
                  onPress={() => setSelectedType(type.value)}
                  className={`flex-row items-center justify-between p-4 ${index !== reportTypes.length - 1 ? "border-b border-border" : ""} ${selectedType === type.value ? "bg-primary/5" : ""}`}
                >
                  <View className="flex-1 mr-3">
                    <Text className="font-semibold text-foreground text-sm">{type.label}</Text>
                    <Text className="text-xs text-muted-foreground mt-0.5">{type.description}</Text>
                  </View>
                  <View
                    className={`h-5 w-5 rounded-full border items-center justify-center ${selectedType === type.value ? "border-primary bg-primary" : "border-muted-foreground"}`}
                  >
                    {selectedType === type.value && <View className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className={`mt-4 mb-2 p-4 rounded-xl ${submitting ? "bg-muted" : "bg-primary"}`}
            >
              <Text className={`text-center font-bold ${submitting ? "text-muted-foreground" : "text-primary-foreground"}`}>
                {submitting ? "Submitting..." : "Submit Report"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
