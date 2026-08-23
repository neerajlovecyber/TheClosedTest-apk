import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet, LayoutChangeEvent } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, withSpring, useSharedValue, interpolate } from "react-native-reanimated";
import { HomeIcon, StoreIcon, FlaskConicalIcon, SettingsIcon, ShieldIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTabScroll } from "@/lib/tab-scroll-context";

interface FloatingTabBarProps extends BottomTabBarProps {
  hasPendingTasks?: boolean;
  hasUnreadMessages?: boolean;
  hasUnreadSupport?: boolean;
  isAdmin?: boolean;
}

const TAB_ICONS: Record<string, any> = {
  index: HomeIcon,
  marketplace: StoreIcon,
  tests: FlaskConicalIcon,
  settings: SettingsIcon,
  admin: ShieldIcon,
};

const TAB_LABELS: Record<string, string> = {
  index: "Home",
  marketplace: "Market",
  tests: "Tests",
  settings: "Settings",
  admin: "Admin",
};

export function FloatingTabBar({ state, descriptors, navigation, hasPendingTasks, hasUnreadMessages, hasUnreadSupport, isAdmin }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);

  const tabScroll = useTabScroll();
  const scrollProgress = tabScroll?.scrollProgress || { value: 0 };

  // Filter out routes that are hidden (e.g. href: null, match/[id], or admin when not admin)
  const visibleRoutes = state.routes.filter((route) => {
    if (route.name === "admin" && !isAdmin) return false;
    const { options } = descriptors[route.key];
    if ((options as any)?.href === null) return false;
    return Boolean(TAB_ICONS[route.name]);
  });

  const activeIndex = visibleRoutes.findIndex((r) => r.key === state.routes[state.index]?.key);

  const numTabs = visibleRoutes.length || 1;
  const paddingH = 6;
  const usableWidth = Math.max(0, barWidth - paddingH * 2);
  const tabWidth = usableWidth / numTabs;

  const translateX = useSharedValue(0);

  useEffect(() => {
    if (activeIndex >= 0 && tabWidth > 0) {
      translateX.value = withSpring(activeIndex * tabWidth, {
        damping: 18,
        stiffness: 170,
        mass: 0.8,
      });
    }
  }, [activeIndex, tabWidth, translateX]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      width: tabWidth,
    };
  });

  const animatedBarStyle = useAnimatedStyle(() => {
    const isShrunk = scrollProgress.value;
    const height = interpolate(isShrunk, [0, 1], [72, 54]);
    const marginHorizontal = interpolate(isShrunk, [0, 1], [16, 28]);
    const scale = interpolate(isShrunk, [0, 1], [1, 0.96]);

    return {
      height,
      marginHorizontal,
      transform: [{ scale }],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const isShrunk = scrollProgress.value;
    const opacity = interpolate(isShrunk, [0, 0.35, 1], [1, 0, 0]);
    const translateY = interpolate(isShrunk, [0, 1], [0, 6]);

    return {
      opacity,
      transform: [{ translateY }],
      height: isShrunk > 0.5 ? 0 : "auto",
    };
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && width !== barWidth) {
      setBarWidth(width);
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.outerContainer, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
      {/* Outer Floating Capsule with Smooth Shrink Animation */}
      <Animated.View
        onLayout={handleLayout}
        className="rounded-full border border-border bg-card dark:bg-card shadow-xl relative flex-row items-center px-1.5 py-1"
        style={[styles.barInner, animatedBarStyle]}
      >
        {/* Sliding Active Pill Enclosing Both Icon & Label */}
        {tabWidth > 0 && (
          <Animated.View
            style={[styles.indicator, animatedIndicatorStyle]}
            className="bg-primary/10 dark:bg-primary/20 border border-primary/20 rounded-full"
          />
        )}

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
    zIndex: 50,
  },
  barInner: {
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  indicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 6,
    zIndex: 1,
  },
});
