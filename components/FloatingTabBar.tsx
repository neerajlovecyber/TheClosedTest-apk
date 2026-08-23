import React, { useEffect } from "react";
import { BlurView } from "expo-blur";
import { useColorScheme } from "nativewind";
import { Platform, View, TouchableOpacity, StyleSheet } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, withSpring, useSharedValue, interpolate } from "react-native-reanimated";
import { HomeIcon, StoreIcon, FlaskConicalIcon, SettingsIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTabScroll } from "@/lib/tab-scroll-context";

interface FloatingTabBarProps extends BottomTabBarProps {
  hasPendingTasks?: boolean;
  hasUnreadMessages?: boolean;
  hasUnreadSupport?: boolean;
}

const TAB_ICONS: Record<string, any> = {
  index: HomeIcon,
  marketplace: StoreIcon,
  tests: FlaskConicalIcon,
  settings: SettingsIcon,
};

const TAB_LABELS: Record<string, string> = {
  index: "Home",
  marketplace: "Market",
  tests: "Tests",
  settings: "Settings",
};

export function FloatingTabBar({ state, descriptors, navigation, hasPendingTasks, hasUnreadMessages, hasUnreadSupport }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const tabScroll = useTabScroll();
  const scrollProgress = tabScroll?.scrollProgress || { value: 0 };

  // Filter out routes that are hidden (e.g. href: null or match/[id])
  const visibleRoutes = state.routes.filter((route) => {
    const { options } = descriptors[route.key];
    if ((options as any)?.href === null) return false;
    return Boolean(TAB_ICONS[route.name]);
  });

  const activeIndex = visibleRoutes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const numTabs = visibleRoutes.length || 1;

  const activePos = useSharedValue(activeIndex >= 0 ? activeIndex : 0);

  useEffect(() => {
    if (activeIndex >= 0) {
      activePos.value = withSpring(activeIndex, {
        damping: 24,
        stiffness: 220,
        mass: 0.6,
      });
    }
  }, [activeIndex]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    const progress = scrollProgress.value;
    const currentMaxWidth = interpolate(progress, [0, 1], [356, 285]);
    const pad = 6;
    const tabWidth = (currentMaxWidth - pad * 2) / numTabs;

    return {
      width: tabWidth,
      transform: [{ translateX: activePos.value * tabWidth + pad }],
    };
  });

  const animatedBarStyle = useAnimatedStyle(() => {
    const progress = scrollProgress.value;
    // Smoothly transition between 356px (expanded) and 285px (compact)
    const maxWidth = interpolate(progress, [0, 1], [356, 285]);
    const scale = interpolate(progress, [0, 1], [1, 0.96]);

    return {
      maxWidth,
      transform: [{ scale }],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const progress = scrollProgress.value;
    const opacity = interpolate(progress, [0, 0.6, 1], [1, 0.2, 0]);
    const height = interpolate(progress, [0, 1], [14, 0]);
    const translateY = interpolate(progress, [0, 1], [0, 2]);

    return {
      opacity,
      height,
      overflow: "hidden",
      transform: [{ translateY }],
    };
  });

  return (
    <View pointerEvents="box-none" style={[styles.outerContainer, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
      {/* Outer Floating Capsule with Smooth Shrink Animation & Real Frosted Glass Blur */}
      <Animated.View
        className="rounded-full border border-border/80 bg-card/85 dark:bg-card/75 shadow-2xl overflow-hidden relative flex-row items-center px-1.5 py-1"
        style={[styles.barInner, animatedBarStyle as any]}
      >
        <BlurView intensity={Platform.OS === "ios" ? 60 : 35} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />

        {/* Smooth Sliding Active Pill Indicator */}
        <Animated.View style={[styles.indicatorWrapper, animatedIndicatorStyle as any]} pointerEvents="none">
          <View
            style={{
              flex: 1,
              marginHorizontal: 3,
              borderRadius: 9999,
              backgroundColor: isDark ? "rgba(59, 130, 246, 0.22)" : "rgba(59, 130, 246, 0.14)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(59, 130, 246, 0.40)" : "rgba(59, 130, 246, 0.30)",
            }}
          />
        </Animated.View>

        {/* Tab Buttons */}
        {visibleRoutes.map((route) => {
          const isFocused = state.routes[state.index]?.key === route.key;
          const IconComponent = TAB_ICONS[route.name] || HomeIcon;
          const label = TAB_LABELS[route.name] || route.name;

          // Notification Badges
          const showRedDot = route.name === "tests" && hasPendingTasks;
          const showBlueDot = (route.name === "tests" && !hasPendingTasks && hasUnreadMessages) || (route.name === "settings" && hasUnreadSupport);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              activeOpacity={0.75}
              className="flex-1 items-center justify-center py-1.5 relative z-10"
            >
              {/* Icon on Top with Notification Dot */}
              <View className="items-center justify-center relative mb-0.5">
                <Icon as={IconComponent} size={26} strokeWidth={isFocused ? 2.5 : 1.9} className={isFocused ? "text-primary" : "text-muted-foreground"} />

                {/* Status Badges */}
                {showRedDot && <View className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-red-500 border border-background shadow-sm" />}
                {showBlueDot && <View className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-sky-500 border border-background shadow-sm" />}
              </View>

              {/* Text Label Directly at the Bottom - Fades out on scroll */}
              <Animated.View style={animatedTextStyle}>
                <Text
                  className={`text-[10px] tracking-tight text-center ${isFocused ? "font-bold text-primary" : "font-medium text-muted-foreground"}`}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 50,
  },
  barInner: {
    width: "100%",
    maxWidth: 356,
    flexDirection: "row",
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  indicatorWrapper: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    zIndex: 1,
  },
});
