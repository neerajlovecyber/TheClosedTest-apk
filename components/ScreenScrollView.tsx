import React, { useState, useCallback } from "react";
import { ScrollView, ScrollViewProps, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabScroll } from "@/lib/tab-scroll-context";

export interface ScreenScrollViewProps extends ScrollViewProps {
  /**
   * Async callback executed when user manually pulls down to refresh.
   * Automatically manages the native RefreshControl spinner without showing on background refetches.
   */
  onRefresh?: () => Promise<unknown> | void;
}

export function ScreenScrollView({
  contentContainerStyle,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  onRefresh,
  refreshControl,
  children,
  ...props
}: ScreenScrollViewProps) {
  const tabScroll = useTabScroll();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      console.warn("ScreenScrollView refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const activeRefreshControl =
    refreshControl !== undefined
      ? refreshControl
      : onRefresh
      ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      : undefined;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      {...props}
      refreshControl={activeRefreshControl}
      contentContainerStyle={[{ paddingBottom: Math.max(insets.bottom, 16) + 95 }, contentContainerStyle]}
      scrollEventThrottle={16}
      onScroll={(e) => {
        tabScroll?.handleScroll(e);
        onScroll?.(e);
      }}
      onScrollBeginDrag={(e) => {
        tabScroll?.handleScrollBegin();
        onScrollBeginDrag?.(e);
      }}
      onScrollEndDrag={(e) => {
        tabScroll?.handleScrollEnd();
        onScrollEndDrag?.(e);
      }}
      onMomentumScrollEnd={(e) => {
        tabScroll?.handleScrollEnd();
        onMomentumScrollEnd?.(e);
      }}
    >
      {children}
    </ScrollView>
  );
}
