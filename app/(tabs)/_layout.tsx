import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCurrentUser, useMatches, useMySupportChat } from "@/lib/api-hooks";
import { getMatchCurrentDay } from "@/lib/date-utils";

import { FloatingTabBar } from "@/components/FloatingTabBar";
import { TabScrollProvider } from "@/lib/tab-scroll-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  const { data: currentUser } = useCurrentUser();
  const isAdmin = Boolean(currentUser?.isAdmin);
  const { data: activeMatches = [] } = useMatches("active");
  const { data: mySupportChat } = useMySupportChat();

  const hasUnreadSupport = mySupportChat?.hasUnreadUser ?? false;

  // Unread chat messages from match partners
  const hasUnreadMessages = React.useMemo(() => {
    if (!currentUser?.id) return false;
    return activeMatches.some((m) => Boolean(m.hasUnreadMessages));
  }, [activeMatches, currentUser?.id]);

  // Only show red badge on Tests if there is an actual task pending action
  const hasPendingTasks = React.useMemo(() => {
    if (!currentUser?.id) return false;
    return activeMatches.some((m) => {
      const isUser1 = m.user1Id === currentUser.id;
      const myLastProof = isUser1 ? m.user1LastProof : m.user2LastProof;
      const partnerLastProof = isUser1 ? m.user2LastProof : m.user1LastProof;

      const highestProofDay = Math.max(1, myLastProof?.day || 1, partnerLastProof?.day || 1);
      const currentDay = getMatchCurrentDay(m.startDate, m.createdAt, highestProofDay);

      // 1. Partner uploaded a proof that you need to review
      const needsReview = partnerLastProof?.status === "pending";
      // 2. You haven't uploaded today's proof (or proof for today was rejected)
      const needsUpload = !myLastProof || myLastProof.day < currentDay || (myLastProof.day === currentDay && (myLastProof.status as string) === "rejected");

      return needsReview || needsUpload;
    });
  }, [activeMatches, currentUser?.id]);

  return (
    <TabScrollProvider>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <Tabs
          tabBar={(props) => (
            <FloatingTabBar
              {...props}
              hasPendingTasks={hasPendingTasks}
              hasUnreadMessages={hasUnreadMessages}
              hasUnreadSupport={hasUnreadSupport}
              isAdmin={isAdmin}
            />
          )}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
            }}
          />
          <Tabs.Screen
            name="marketplace"
            options={{
              title: "Marketplace",
            }}
          />
          <Tabs.Screen
            name="tests"
            options={{
              title: "Tests",
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: "Settings",
            }}
          />
          <Tabs.Screen
            name="match/[id]"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="admin"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </View>
    </TabScrollProvider>
  );
}
