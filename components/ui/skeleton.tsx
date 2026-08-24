import React, { useEffect, useRef } from "react";
import { Animated, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";

interface SkeletonProps extends ViewProps {
  className?: string;
}

export function Skeleton({ className, style, ...props }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ opacity }, style]}
      className={cn("bg-muted/90 rounded-xl", className)}
      {...props}
    />
  );
}
