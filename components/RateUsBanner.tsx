import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  StarIcon,
  XIcon,
  ExternalLinkIcon,
  HeartIcon,
  MessageSquareIcon,
  FlameIcon,
  SparklesIcon,
} from "lucide-react-native";
import { RatingManager, SNOOZE_SHORT_MS, SNOOZE_LONG_MS } from "@/lib/rating-manager";
import { toast } from "@/lib/sonner";

export interface RateUsBannerProps {
  userStreak?: number;
  reputation?: number;
  hasActiveMatches?: boolean;
  dueTasksCount?: number;
}

export function RateUsBanner({ userStreak = 0, reputation = 100, hasActiveMatches = false, dueTasksCount = 0 }: RateUsBannerProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [selectedRating, setSelectedRating] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    RatingManager.shouldShowBanner({
      streak: userStreak,
      reputation,
      hasAppsOrMatches: hasActiveMatches,
      dueTasksCount,
    }).then((shouldShow) => {
      if (isMounted) {
        setIsVisible(shouldShow);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [userStreak, reputation, hasActiveMatches, dueTasksCount]);

  const handleDismiss = async () => {
    setIsVisible(false);
    await RatingManager.snoozeBanner(SNOOZE_SHORT_MS);
  };

  const handleMaybeLater = async () => {
    setIsVisible(false);
    await RatingManager.snoozeBanner(SNOOZE_LONG_MS);
  };

  const handleStarPress = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleOpenPlayStore = async () => {
    setIsVisible(false);
    await RatingManager.markAsRated();
    toast.success("Thank you for supporting indie devs! ❤️", {
      description: "Opening Google Play Store...",
    });
    await RatingManager.openPlayStoreListing();
  };

  const handleFeedback = async () => {
    setIsVisible(false);
    await RatingManager.snoozeBanner(SNOOZE_SHORT_MS);
    router.push("/help" as any);
  };

  if (!isVisible) return null;

  const isHighRating = selectedRating >= 4;
  const isLowRating = selectedRating > 0 && selectedRating < 4;

  return (
    <View className="px-6 mb-4">
      <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-orange-500/10 dark:bg-amber-950/20 overflow-hidden shadow-sm">
        <CardContent className="p-4">
          {/* Top Bar: Badge & Dismiss Button */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-1.5">
              <View className="bg-amber-500/20 p-1 rounded-lg">
                <Icon as={isHighRating ? HeartIcon : userStreak > 0 ? FlameIcon : SparklesIcon} className="size-3.5 text-amber-500 dark:text-amber-400" />
              </View>
              <Text className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                {isHighRating
                  ? "Indie Dev Community • Thank You!"
                  : isLowRating
                    ? "We Value Your Feedback"
                    : userStreak >= 3
                      ? `🔥 ${userStreak}-Day Streak Achiever`
                      : "Community Feedback • Rate Us"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="p-1 rounded-full active:bg-muted/40"
              accessibilityLabel="Dismiss rate us banner"
            >
              <Icon as={XIcon} className="size-4 text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* Headline & Body Text */}
          {isHighRating ? (
            <>
              <Text className="text-base font-bold text-foreground mb-1">Help fellow developers find peer testing! ⭐</Text>
              <Text className="text-xs text-muted-foreground leading-relaxed mb-2.5">
                Google Play weighs reviews from the last 90 days most heavily. A 30-second review mentioning "14-day closed test" keeps this tool 100% free and
                brings more testers to test your app.
              </Text>
            </>
          ) : isLowRating ? (
            <>
              <Text className="text-base font-bold text-foreground mb-1">Help us make The Closed Test better! 🛠️</Text>
              <Text className="text-xs text-muted-foreground leading-relaxed mb-2.5">
                We're sorry your experience hasn't been 5 stars. Send us your feedback directly — our team reviews every ticket so your closed testing isn't
                delayed.
              </Text>
            </>
          ) : (
            <>
              <Text className="text-base font-bold text-foreground mb-1">Enjoying peer testing on The Closed Test? 🚀</Text>
              <Text className="text-xs text-muted-foreground leading-relaxed mb-2.5">
                Devs helping devs pass Google Play's 20-tester rule. Tap a star below to rate your experience:
              </Text>
            </>
          )}

          {/* Interactive Star Rating Selector */}
          <View className="flex-row items-center justify-center gap-2 py-1 mb-3 bg-background/60 dark:bg-black/20 rounded-xl border border-amber-500/10">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = selectedRating >= star;
              return (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleStarPress(star)}
                  className="p-2 active:scale-110"
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  accessibilityLabel={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Icon as={StarIcon} className={`size-6 ${isFilled ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30 fill-transparent"}`} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-2">
            {isHighRating ? (
              <>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl flex-row items-center justify-center gap-1.5 h-9 bg-amber-500 hover:bg-amber-600 active:bg-amber-600"
                  onPress={handleOpenPlayStore}
                >
                  <Icon as={StarIcon} className="size-3.5 text-white fill-white" />
                  <Text className="text-white text-xs font-bold">Rate on Google Play</Text>
                  <Icon as={ExternalLinkIcon} className="size-3 text-white/80" />
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl h-9 px-3.5" onPress={handleMaybeLater}>
                  <Text className="text-xs font-semibold text-foreground">Maybe Later</Text>
                </Button>
              </>
            ) : isLowRating ? (
              <>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl flex-row items-center justify-center gap-1.5 h-9 bg-secondary active:bg-secondary/80"
                  onPress={handleFeedback}
                >
                  <Icon as={MessageSquareIcon} className="size-3.5 text-foreground" />
                  <Text className="text-foreground text-xs font-bold">Send Feedback to Team</Text>
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl h-9 px-3.5" onPress={handleMaybeLater}>
                  <Text className="text-xs font-semibold text-foreground">Dismiss</Text>
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl flex-row items-center justify-center gap-1.5 h-9 bg-amber-500 hover:bg-amber-600 active:bg-amber-600"
                  onPress={handleOpenPlayStore}
                >
                  <Icon as={StarIcon} className="size-3.5 text-white fill-white" />
                  <Text className="text-white text-xs font-bold">Rate on Google Play</Text>
                  <Icon as={ExternalLinkIcon} className="size-3 text-white/80" />
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl h-9 px-3.5" onPress={handleMaybeLater}>
                  <Text className="text-xs font-semibold text-foreground">Later</Text>
                </Button>
              </>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
}
