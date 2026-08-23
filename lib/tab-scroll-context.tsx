import React, { createContext, useContext, useRef } from "react";
import { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";

interface TabScrollContextType {
  scrollProgress: { value: number }; // 0 = expanded (show text), 1 = shrunk (hide text)
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleScrollBegin: () => void;
  handleScrollEnd: () => void;
}

const TabScrollContext = createContext<TabScrollContextType | null>(null);

export function TabScrollProvider({ children }: { children: React.ReactNode }) {
  const scrollProgress = useSharedValue(0);
  const lastScrollY = useRef(0);

  const setShrunk = (shrunk: boolean) => {
    scrollProgress.value = withSpring(shrunk ? 1 : 0, {
      damping: 18,
      stiffness: 170,
      mass: 0.7,
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;
    lastScrollY.current = currentY;

    // If near the very top of the list, always show full text
    if (currentY <= 15) {
      setShrunk(false);
      return;
    }

    // Scroll Down -> Hide text & shrink
    if (diff > 4 && currentY > 30) {
      setShrunk(true);
    }
    // Scroll Up -> Immediately show text & expand
    else if (diff < -4) {
      setShrunk(false);
    }
  };

  const handleScrollBegin = () => {
    // Keep current state until direction is determined
  };

  const handleScrollEnd = () => {
    // If momentum finishes near the top, expand
    if (lastScrollY.current <= 30) {
      setShrunk(false);
    }
  };

  return (
    <TabScrollContext.Provider
      value={{
        scrollProgress,
        handleScroll,
        handleScrollBegin,
        handleScrollEnd,
      }}
    >
      {children}
    </TabScrollContext.Provider>
  );
}

export function useTabScroll() {
  return useContext(TabScrollContext);
}
