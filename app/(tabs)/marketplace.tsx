import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { View, TouchableOpacity, useWindowDimensions, ActivityIndicator, RefreshControl } from "react-native";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Modal, Pressable, Linking } from "react-native";
import { SearchIcon, CheckCircleIcon, UsersIcon } from "lucide-react-native";
import { useRouter } from "expo-router";
import { AppCard } from "@/components/AppCard";
import { GoogleGroupWidget } from "@/components/GoogleGroupWidget";
import { ReportDialog } from "@/components/ReportDialog";
import { ErrorState } from "@/components/ErrorState";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useCurrentUser, useInfiniteRecruitingApps, useMatches, useRefreshOnFocus, AppEntity } from "@/lib/api-hooks";

export default function MarketplaceScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportApp, setReportApp] = useState<any>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index || 0);
    }
  });

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  });

  // API Queries
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: user } = useCurrentUser();
  const {
    data: appsData,
    isLoading,
    isError,
    refetch,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteRecruitingApps(debouncedSearch || undefined, 20);
  const { data: allMatches = [], refetch: refetchMatches } = useMatches("all");

  // Instant refresh when switching to Marketplace tab
  useRefreshOnFocus(
    useCallback(async () => {
      await Promise.all([refetch(), refetchMatches()]);
    }, [refetch, refetchMatches]),
  );

  const apps = useMemo(() => appsData?.pages.flatMap((page) => page.apps) ?? [], [appsData]);
  const totalApps = appsData?.pages[0]?.total ?? apps.length;
  const hasMoreApps = hasNextPage ?? false;

  const onLoadMore = useCallback(() => {
    if (hasMoreApps && !isFetchingNextPage && !isFetching) {
      fetchNextPage();
    }
  }, [hasMoreApps, isFetchingNextPage, isFetching, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchMatches()]);
  }, [refetch, refetchMatches]);

  const matchStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMatches) {
      if (m.app1Id) map.set(m.app1Id, m.status);
      if (m.app2Id) map.set(m.app2Id, m.status);
    }
    return map;
  }, [allMatches]);

  // 1. Latest Opportunities: strictly sorted by latest (newest createdAt first)
  const latestOpportunities = useMemo(() => {
    return apps
      .filter((app: AppEntity) => {
        const isOpen = app.status === "recruiting" && app.currentTesters < app.requiredTesters;
        const isNotMine = !user?.id || app.userId !== user.id;
        return isOpen && isNotMine;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 16);
  }, [apps, user?.id]);

  const groupedRecruiting = useMemo(() => {
    const chunked = [];
    const arr = latestOpportunities || [];
    for (let i = 0; i < arr.length; i += 4) {
      chunked.push(arr.slice(i, i + 4));
    }
    return chunked;
  }, [latestOpportunities]);

  // 2. All Apps: strictly sorted by highest developer reputation first, filled at the end
  const allAppsSortedByReputation = useMemo(() => {
    return [...apps].sort((a, b) => {
      const isFilledA = a.status === "filled" || (a.currentTesters !== undefined && a.requiredTesters !== undefined && a.currentTesters >= a.requiredTesters);
      const isFilledB = b.status === "filled" || (b.currentTesters !== undefined && b.requiredTesters !== undefined && b.currentTesters >= b.requiredTesters);

      // Ensure filled apps (status 'filled' or currentTesters >= requiredTesters) appear at the end
      if (isFilledA && !isFilledB) return 1;
      if (isFilledB && !isFilledA) return -1;

      const repA = a.user?.reputation ?? 100;
      const repB = b.user?.reputation ?? 100;
      if (repB !== repA) {
        return repB - repA; // Highest reputation first
      }
      // Tie breaker: newest created first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [apps]);

  const handleAppPress = useCallback(
    (appId: string) => {
      router.push({
        pathname: "/app-details/[id]",
        params: { id: appId, source: "marketplace" },
      } as any);
    },
    [router],
  );

  const handleReportApp = useCallback((app: any) => {
    setReportApp(app);
    setShowReportDialog(true);
  }, []);

  const renderAppItem = useCallback(
    ({ item }: { item: AppEntity }) => (
      <AppCard
        key={item.id}
        item={{
          _id: item.id,
          title: item.title,
          iconUrl: item.iconUrl,
          currentTesters: item.currentTesters,
          requiredTesters: item.requiredTesters,
          status: item.status,
          ownerName: item.user?.name || item.user?.email?.split("@")[0] || "Community Developer",
          reputation: item.user?.reputation ?? 100,
        }}
        onPress={() => handleAppPress(item.id)}
        onReport={() => handleReportApp(item)}
        matchStatus={matchStatusMap.get(item.id)}
      />
    ),
    [handleAppPress, matchStatusMap, handleReportApp],
  );

  const keyExtractor = useCallback((item: AppEntity) => item.id, []);

  const renderGroupItem = useCallback(
    ({ item: group }: { item: AppEntity[] }) => (
      <View style={{ width: windowWidth * 0.85 }} className="mr-4">
        {group.map((app: AppEntity) => (
          <AppCard
            key={app.id}
            item={{
              _id: app.id,
              title: app.title,
              iconUrl: app.iconUrl,
              currentTesters: app.currentTesters,
              requiredTesters: app.requiredTesters,
              status: app.status,
              ownerName: app.user?.name || app.user?.email?.split("@")[0] || "Community Developer",
              reputation: app.user?.reputation ?? 100,
            }}
            onPress={() => handleAppPress(app.id)}
            onReport={() => handleReportApp(app)}
            matchStatus={matchStatusMap.get(app.id)}
          />
        ))}
      </View>
    ),
    [windowWidth, handleAppPress, matchStatusMap, handleReportApp],
  );

  const groupKeyExtractor = useCallback((item: AppEntity[], index: number) => `group-${index}`, []);

  return (
    <View className="flex-1 bg-background">
      <ScreenScrollView
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
      >
        <View className="gap-3">
          <View className="mb-0 flex-row justify-between items-start">
            <View>
              <Text className="text-3xl font-extrabold text-foreground tracking-tight">Marketplace</Text>
              <Text className="text-sm text-muted-foreground font-medium mt-0.5">Find apps, swap tests, get published.</Text>
            </View>
            <View className="flex-row gap-2">
              {(user?.isGroupMember || user?.googleGroupConfirmed) && (
                <TouchableOpacity
                  onPress={() => setShowGroupModal(true)}
                  className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center border border-green-500/20"
                  activeOpacity={0.7}
                >
                  <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-5" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push("/help" as any)}
                className="w-10 h-10 rounded-full bg-orange-500/10 items-center justify-center border border-orange-500/20"
                activeOpacity={0.7}
              >
                <Text className="text-orange-600 dark:text-orange-400 text-xl font-bold">?</Text>
              </TouchableOpacity>
            </View>
          </View>

          {user && !user.isGroupMember && !user.googleGroupConfirmed && <GoogleGroupWidget className="mb-0" />}

          {/* Search Bar */}
          <View className="relative">
            <View className="absolute left-3 top-3 z-10">
              <Icon as={SearchIcon} className="size-4 text-muted-foreground" />
            </View>
            <Input
              placeholder="Find specific apps..."
              className="pl-9 h-10 bg-card border-border shadow-sm text-foreground"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Latest Opportunities Carousel: Sorted by Latest */}
          {isError ? (
            <ErrorState
              title="Couldn't load the marketplace"
              message="We couldn't reach the server. Pull down or tap retry once you're back online."
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : (
            <>
              {!searchQuery && (
                <View className="mt-1">
                  <Text className="text-lg font-bold px-1 mb-2">Latest Opportunities</Text>
                  {groupedRecruiting.length > 0 ? (
                    <View>
                      <FlashList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={groupedRecruiting}
                        keyExtractor={groupKeyExtractor}
                        snapToInterval={windowWidth * 0.85 + 16}
                        decelerationRate="fast"
                        snapToAlignment="start"
                        onViewableItemsChanged={onViewableItemsChanged.current}
                        viewabilityConfig={viewabilityConfig.current}
                        contentContainerStyle={{ paddingRight: 16 }}
                        renderItem={renderGroupItem}
                      />
                      <View className="flex-row justify-center mt-2 gap-2">
                        {groupedRecruiting.map((_, index) => (
                          <View
                            key={index}
                            className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View className="items-center py-4">
                      <Text className="text-muted-foreground">No new apps available yet.</Text>
                    </View>
                  )}
                </View>
              )}

              {/* All Apps List: Sorted by Highest Reputation */}
              <View className="mt-1">
                <View className="flex-row justify-between items-center px-1 mb-3">
                  <Text className="text-lg font-bold">{searchQuery ? "Search Results" : "All Apps"}</Text>
                  <Text className="text-xs text-muted-foreground font-medium">
                    {allAppsSortedByReputation.length} {allAppsSortedByReputation.length === 1 ? "app" : "apps"}
                  </Text>
                </View>

                {allAppsSortedByReputation.length > 0 ? (
                  <View className="gap-0">
                    {allAppsSortedByReputation.map((item: AppEntity) => (
                      <React.Fragment key={keyExtractor(item)}>{renderAppItem({ item })}</React.Fragment>
                    ))}
                    {hasMoreApps && (
                      <Button variant="outline" className="mt-4 mx-6" onPress={onLoadMore} disabled={isFetchingNextPage}>
                        <Text>{isFetchingNextPage ? "Loading..." : "Load more apps"}</Text>
                      </Button>
                    )}
                    {!hasMoreApps && apps.length > 20 && <Text className="text-center text-xs text-muted-foreground mt-4">You've reached the end.</Text>}
                  </View>
                ) : isLoading ? (
                  <LoadingAnimation message="Discovering apps..." />
                ) : (
                  <View className="items-center py-10">
                    <Text className="text-muted-foreground">No apps found.</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScreenScrollView>

      {/* Google Group Modal */}
      <Modal animationType="slide" transparent={true} visible={showGroupModal} onRequestClose={() => setShowGroupModal(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setShowGroupModal(false)}>
          <Pressable className="bg-background rounded-t-3xl p-6">
            <View className="flex-row items-center gap-3 mb-4">
              <View className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                <Icon as={UsersIcon} className="size-6 text-green-600 dark:text-green-400" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">Google Group</Text>
                <Text className="text-sm text-muted-foreground">Community Member</Text>
              </View>
            </View>

            <Text className="text-muted-foreground mb-4">You're a verified member of our developer community Google Group.</Text>

            <Button
              size="lg"
              className="bg-green-600 dark:bg-green-600"
              onPress={() => {
                Linking.openURL("https://groups.google.com/g/developers-community-official");
                setShowGroupModal(false);
              }}
            >
              <Text className="text-white font-bold">Open Google Group</Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report Dialog */}
      {reportApp && (
        <ReportDialog
          visible={showReportDialog}
          onClose={() => setShowReportDialog(false)}
          reportType="app"
          targetId={reportApp.id}
          reportedAppId={reportApp.id}
          targetName={reportApp.title}
        />
      )}
    </View>
  );
}
