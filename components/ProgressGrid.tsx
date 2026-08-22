import React, { memo, useMemo, useRef, useEffect } from "react";
import { View, Pressable, useWindowDimensions, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { CheckCircle2Icon, XCircleIcon, ClockIcon, LockIcon, AlertCircleIcon } from "lucide-react-native";

type DayStatus = {
  day: number;
  isFuture: boolean;
  isToday: boolean;
  myStatus: string; // 'approved' | 'pending' | 'rejected' | 'missed' | 'future' | 'not_uploaded'
  partnerStatus: string;
  myProof: any;
  partnerProof: any;
};

interface ProgressGridProps {
  days: DayStatus[];
  currentDay: number;
  summary: {
    myApproved: number;
    partnerApproved: number;
    totalDays: number;
  };
  onDayPress?: (day: number) => void;
  selectedDay?: number;
}

// Memoized Status Indicator Component
const StatusDot = memo(({ status, isMe }: { status: string; isMe?: boolean }) => {
  const { color, icon, iconColor } = useMemo(() => {
    let color = "bg-muted/50";
    let icon = null as any;
    let iconColor = "text-muted-foreground";

    switch (status) {
      case "approved":
        color = "bg-green-100 dark:bg-green-900/40";
        icon = CheckCircle2Icon;
        iconColor = "text-green-600 dark:text-green-400";
        break;
      case "pending":
        color = "bg-orange-100 dark:bg-orange-900/40";
        icon = ClockIcon;
        iconColor = "text-orange-600 dark:text-orange-400";
        break;
      case "rejected":
        color = "bg-red-100 dark:bg-red-900/40";
        icon = XCircleIcon;
        iconColor = "text-red-600 dark:text-red-400";
        break;
      case "missed":
        color = "bg-destructive/10";
        icon = AlertCircleIcon;
        iconColor = "text-destructive";
        break;
      case "future":
        color = "bg-secondary/30";
        icon = LockIcon;
        iconColor = "text-muted-foreground/30";
        break;
      case "not_uploaded":
        color = "bg-secondary/30";
        break;
    }

    return { color, icon, iconColor };
  }, [status]);

  if ((status === "not_uploaded" || status === "future") && !icon) {
    return (
      <View className={`w-5 h-5 rounded-full ${color} items-center justify-center`}>
        <View className="w-1 h-1 rounded-full bg-muted-foreground/30" />
      </View>
    );
  }

  return <View className={`w-5 h-5 rounded-full ${color} items-center justify-center`}>{icon && <Icon as={icon} className={`size-3 ${iconColor}`} />}</View>;
});

function ProgressGridComponent({ days, currentDay, summary, onDayPress, selectedDay }: ProgressGridProps) {
  const { width } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);

  const CARD_WIDTH = 85;
  const CARD_MARGIN = 8; // mr-2 = 8px
  const PADDING = 16;

  // Auto-scroll to selected day when component mounts or selectedDay changes
  useEffect(() => {
    if (scrollViewRef.current && selectedDay) {
      // Calculate scroll position to center the selected day
      const cardTotalWidth = CARD_WIDTH + CARD_MARGIN;
      const scrollX = Math.max(0, (selectedDay - 1) * cardTotalWidth - width / 2 + CARD_WIDTH / 2 + PADDING);

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: scrollX, animated: true });
      }, 100);
    }
  }, [selectedDay, width]);

  // Calculate if YOU have pending screenshots from previous days (waiting for partner approval)
  const myPendingPreviousDays = useMemo(() => {
    const pending = days.filter(
      (d) => d.day < currentDay && d.myStatus === "pending", // YOUR uploads waiting for partner
    );

    return pending;
  }, [days, currentDay]);

  // Calculate if PARTNER has pending screenshots from previous days (waiting for YOUR approval)
  const partnerPendingPreviousDays = useMemo(() => {
    const pending = days.filter(
      (d) => d.day < currentDay && d.partnerStatus === "pending", // PARTNER's uploads waiting for you
    );

    return pending;
  }, [days, currentDay, myPendingPreviousDays]);

  const hasMyPendingPreviousDays = myPendingPreviousDays.length > 0;
  const hasPartnerPendingPreviousDays = partnerPendingPreviousDays.length > 0;

  return (
    <View>
      {/* Unified Score Card Header */}
      <View className="mx-4 mb-2 p-2 rounded-xl bg-card border border-border shadow-sm">
        <View className="flex-row justify-between items-center">
          <View className="items-center flex-1 border-r border-border/50">
            <Text className="text-3xl font-bold text-green-600 dark:text-green-400">
              {summary.partnerApproved}/{summary.totalDays}
            </Text>
            <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">You Reviewed</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-3xl font-bold text-primary">
              {summary.myApproved}/{summary.totalDays}
            </Text>
            <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">They Reviewed</Text>
          </View>
        </View>

        {/* Legend inside card */}
        <View className="mt-3 pt-2 border-t border-border/30">
          <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 justify-center">
            <View className="flex-row items-center gap-1">
              <Icon as={CheckCircle2Icon} className="size-3 text-green-600" />
              <Text className="text-[9px] text-muted-foreground">Approved</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon as={ClockIcon} className="size-3 text-orange-600" />
              <Text className="text-[9px] text-muted-foreground">Pending</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon as={XCircleIcon} className="size-3 text-red-600" />
              <Text className="text-[9px] text-muted-foreground">Rejected</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon as={AlertCircleIcon} className="size-3 text-destructive" />
              <Text className="text-[9px] text-muted-foreground">Missed</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Warning Banner for Your Pending Previous Days */}
      {hasMyPendingPreviousDays && (
        <View className="mx-4 mb-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50">
          <View className="flex-row items-center">
            <Icon as={AlertCircleIcon} className="size-4 text-orange-600 dark:text-orange-400 mr-2" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-orange-900 dark:text-orange-200">
                Partner hasn't approved {myPendingPreviousDays.length} old {myPendingPreviousDays.length === 1 ? "screenshot" : "screenshots"}
              </Text>
              <Text className="text-[10px] text-orange-700 dark:text-orange-300 mt-0.5">Follow up with them or wait for review</Text>
            </View>
          </View>
        </View>
      )}

      {/* Warning Banner for Partner's Pending Previous Days */}
      {hasPartnerPendingPreviousDays && (
        <View className="mx-4 mb-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50">
          <View className="flex-row items-center">
            <Icon as={AlertCircleIcon} className="size-4 text-blue-600 dark:text-blue-400 mr-2" />
            <View className="flex-1">
              <Text className="text-xs font-bold text-blue-900 dark:text-blue-200">
                You need to approve {partnerPendingPreviousDays.length} old {partnerPendingPreviousDays.length === 1 ? "screenshot" : "screenshots"}
              </Text>
              <Text className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">Tap day cards below to review and approve</Text>
            </View>
          </View>
        </View>
      )}

      <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} className="flex-row">
        {days.map((dayItem) => {
          const isToday = dayItem.day === currentDay;
          const isSelected = dayItem.day === selectedDay;
          const isFuture = dayItem.isFuture;

          return (
            <Pressable
              key={dayItem.day}
              onPress={() => onDayPress?.(dayItem.day)}
              style={{ width: 85 }}
              className={`p-2 mr-2 rounded-xl border-2 aspect-[0.85] justify-between items-center ${
                isSelected ? "border-primary bg-primary/10" : isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"
              } ${isFuture ? "opacity-70" : "active:opacity-70"}`}
            >
              <View className={`px-2 py-0.5 rounded-md mb-2 ${isSelected ? "bg-primary" : isToday ? "bg-primary/70" : "bg-secondary"}`}>
                <Text className={`text-xs font-bold ${isSelected || isToday ? "text-primary-foreground" : "text-muted-foreground"}`}>Day {dayItem.day}</Text>
              </View>

              <View className="flex-1 justify-center gap-1.5 w-full px-1">
                {/* Row for You */}
                <View className="flex-row items-center justify-between w-full">
                  <Text className="text-[10px] text-muted-foreground">You</Text>
                  <StatusDot status={dayItem.myStatus} isMe />
                </View>
                {/* Row for Partner */}
                <View className="flex-row items-center justify-between w-full">
                  <Text className="text-[10px] text-muted-foreground">Them</Text>
                  <StatusDot status={dayItem.partnerStatus} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Export memoized component
export const ProgressGrid = memo(ProgressGridComponent);
