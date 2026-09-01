import React from "react";
import { View, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { StarIcon, MessageSquareIcon } from "lucide-react-native";

export interface AppItem {
  _id: string;
  title: string;
  iconUrl?: string;
  currentTesters?: number;
  requiredTesters?: number;
  ownerAvatar?: string;
  ownerName?: string;
  ownerEmail?: string;
  reputation?: number;
  status?: string; // 'recruiting', 'filled', 'pending', 'completed'
  day?: number;
  totalDays?: number;
  dueIn?: string;
  isFilled?: boolean;
  isNew?: boolean;
  hasUnread?: boolean;
  isReviewPending?: boolean;
  flagCount?: number;
  visibility?: {
    status: "unverified" | "visible" | "hidden";
    positiveVotes: number;
    negativeVotes: number;
    voters: string[];
  };
}

interface AppCardProps {
  item: AppItem;
  onPress?: () => void;
  onReport?: () => void;
  variant?: "marketplace" | "my-app" | "testing";
  actionBadge?: string;
  matchStatus?: "active" | "pending_sent" | "pending_received" | string;
}

export function AppCard({ item, onPress, onReport, variant = "marketplace", actionBadge, matchStatus }: AppCardProps) {
  const isMyApp = variant === "my-app";
  const isTesting = variant === "testing";

  // Determine if filled (either from flag or by comparing testers)
  const isFilled = item.isFilled || (item.currentTesters !== undefined && item.requiredTesters !== undefined && item.currentTesters >= item.requiredTesters);

  // Show warning if flagged multiple times or visibility is hidden
  const isHidden = item.visibility?.status === "hidden";
  const isFlagged = (item.flagCount || 0) > 0 || isHidden;
  const [imageError, setImageError] = React.useState(false);
  const DEFAULT_ICON = "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=160&auto=format&fit=crop&q=80";

  React.useEffect(() => {
    setImageError(false);
  }, [item.iconUrl]);

  const displayIconUrl = !imageError && item.iconUrl ? item.iconUrl : DEFAULT_ICON;

  const Content = (
    <Card className={`mb-3 p-1.5 flex-row gap-2 ${isFlagged ? "border-2 border-red-300 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10" : ""}`}>
      <Image
        key={displayIconUrl}
        source={{ uri: displayIconUrl }}
        onError={() => setImageError(true)}
        style={{ width: 80, height: 80, borderRadius: 12 }}
        className="w-20 h-20 rounded-xl bg-muted border border-border"
        contentFit="cover"
      />
      <View className="flex-1 justify-between py-0.5">
        {/* Header Row: Title & Badge */}
        <View className="flex-row justify-between items-start">
          <View className="flex-1 flex-row items-center gap-1.5 mr-2">
            <Text className="font-bold text-sm leading-tight shrink" numberOfLines={1}>
              {item.title}
            </Text>
          </View>

          {/* Action Badge & Reputation Container */}
          <View className="flex-row items-center gap-2">
            {/* Reputation removed from here */}

            {actionBadge ? (
              actionBadge === "Message" ? (
                <View className="bg-sky-500 w-8 h-8 rounded-full items-center justify-center shadow-md">
                  <Icon as={MessageSquareIcon} className="text-white size-4" />
                </View>
              ) : (
                <View className={`px-2.5 py-1 rounded-full ${actionBadge === "Approve" ? "bg-orange-500" : "bg-blue-500"}`}>
                  <Text className="text-[11px] text-white font-bold uppercase tracking-wide">{actionBadge}</Text>
                </View>
              )
            ) : (
              <>
                {/* Variant Specific Badges */}
                {variant === "marketplace" && (
                  <>
                    {matchStatus === "active" ? (
                      <View className="bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase">Active</Text>
                      </View>
                    ) : matchStatus === "pending" || matchStatus === "pending_sent" ? (
                      <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">Pending</Text>
                      </View>
                    ) : matchStatus === "pending_received" ? (
                      <View className="bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase">Request</Text>
                      </View>
                    ) : isFilled ? (
                      <View className="bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase">Filled</Text>
                      </View>
                    ) : item.isNew ? (
                      <View className="bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase">New</Text>
                      </View>
                    ) : null}
                  </>
                )}
                {isMyApp && (
                  <View className={`px-2 py-0.5 rounded-full ${isFilled ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"}`}>
                    <Text className={`text-[10px] font-bold uppercase ${isFilled ? "text-green-600 dark:text-green-400" : "text-primary"}`}>
                      {isFilled ? "Filled" : item.status || "Active"}
                    </Text>
                  </View>
                )}

                {isTesting && item.isReviewPending && (
                  <View className="bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full ml-1">
                    <Text className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase">Review Needed</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Middle Row: Subtitle / Stats */}
        {isTesting ? (
          <View>
            <Text className="text-muted-foreground text-sm" numberOfLines={1}>
              {item.ownerName ? `By ${item.ownerName}` : "Testing in Progress"}
            </Text>
          </View>
        ) : (
          <View>
            {item.status === "completed" ? (
              <Text className="text-green-600 dark:text-green-400 text-sm font-medium">Live in Production 🚀</Text>
            ) : (
              <Text className="text-muted-foreground text-sm">
                {item.currentTesters || 0} / {item.requiredTesters || 12} Testers
              </Text>
            )}
          </View>
        )}

        {/* Bottom Row / Content */}
        <View className="mt-1">
          {variant === "marketplace" && (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Badge variant="secondary" className="px-2 py-0.5 rounded-md">
                  <Text className="text-xs font-medium text-foreground" numberOfLines={1}>
                    {item.ownerName || "Developer"}
                  </Text>
                </Badge>
                {/* Reputation (Moved back to bottom) */}
                <View className="flex-row items-center gap-1">
                  <Icon as={StarIcon} className="size-3 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                  <Text className="text-xs text-green-600 dark:text-green-500 font-bold">{item.reputation || 100}</Text>
                </View>
              </View>

              {/* Flag Warning */}
              {isFlagged && (
                <Badge variant="destructive" className="px-1.5 py-0.5 rounded">
                  <Text className="text-[10px] text-white font-bold">{isHidden ? "⚠️ Not Visible" : "⚠️ Check Info"}</Text>
                </Badge>
              )}
            </View>
          )}

          {isMyApp && item.status !== "completed" && (
            <Progress
              value={Math.min(100, ((item.currentTesters || 0) / (item.requiredTesters || 12)) * 100)}
              indicatorClassName={isFilled ? "bg-green-500" : "bg-primary"}
              className="h-2 w-full"
            />
          )}

          {/* Hidden Warning for My App (Below Progress Bar) */}
          {isMyApp && isHidden && (
            <Badge variant="destructive" className="mt-2 self-start px-2 py-1 rounded">
              <Text className="text-[10px] text-white font-bold">⚠️ App reported not visible to testers</Text>
            </Badge>
          )}

          {isTesting && (
            <View className="flex-row items-center gap-1.5">
              {/* Simple Day Indicator */}
              <Badge variant="secondary" className="px-2 py-0.5 rounded-md">
                <Text className="text-xs font-medium text-foreground">
                  Day {item.day || 1} of {item.totalDays || 14}
                </Text>
              </Badge>
            </View>
          )}
        </View>
      </View>
    </Card>
  );

  if (onPress || onReport) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
}
