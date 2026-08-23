import React from "react";
import { ScrollView, ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabScroll } from "@/lib/tab-scroll-context";

export function ScreenScrollView({
  contentContainerStyle,
  onScroll,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
  children,
  ...props
}: ScrollViewProps) {
  const tabScroll = useTabScroll();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      {...props}
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
