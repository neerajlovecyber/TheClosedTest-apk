import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";
import { Text } from "@/components/ui/text";

interface LoadingAnimationProps {
  message?: string;
  subtitle?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
}

export function LoadingAnimation({
  message,
  subtitle,
  fullScreen = false,
  size = "md",
}: LoadingAnimationProps) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: -8,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 350,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 500 - delay)),
        ]),
      );
    };

    const anim1 = createDotAnimation(dot1, 0);
    const anim2 = createDotAnimation(dot2, 160);
    const anim3 = createDotAnimation(dot3, 320);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotSize = size === "sm" ? "w-2 h-2" : size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  const gapSize = size === "sm" ? "gap-1.5" : size === "lg" ? "gap-3" : "gap-2";

  const content = (
    <View className="items-center justify-center py-6 px-4">
      {/* 3-Dot Wave Container */}
      <View className={`flex-row items-center justify-center ${gapSize} h-7`}>
        <Animated.View
          style={{
            transform: [{ translateY: dot1 }],
            opacity: dot1.interpolate({
              inputRange: [-8, 0],
              outputRange: [1, 0.45],
            }),
          }}
          className={`${dotSize} rounded-full bg-primary`}
        />
        <Animated.View
          style={{
            transform: [{ translateY: dot2 }],
            opacity: dot2.interpolate({
              inputRange: [-8, 0],
              outputRange: [1, 0.45],
            }),
          }}
          className={`${dotSize} rounded-full bg-primary`}
        />
        <Animated.View
          style={{
            transform: [{ translateY: dot3 }],
            opacity: dot3.interpolate({
              inputRange: [-8, 0],
              outputRange: [1, 0.45],
            }),
          }}
          className={`${dotSize} rounded-full bg-primary`}
        />
      </View>

      {/* Text Labels */}
      {message && (
        <Text className="text-sm font-medium text-foreground text-center mt-2.5">
          {message}
        </Text>
      )}
      {subtitle && (
        <Text className="text-xs text-muted-foreground text-center mt-1 leading-relaxed">
          {subtitle}
        </Text>
      )}
    </View>
  );

  if (fullScreen) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        {content}
      </View>
    );
  }

  return content;
}
