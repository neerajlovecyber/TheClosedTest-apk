import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react-native";

export interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewerModal({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: ImageViewerModalProps) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<string>>(null);

  // Sync index when opening or initialIndex changes
  useEffect(() => {
    if (visible) {
      const idx = Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1));
      setCurrentIndex(idx);
      setTimeout(() => {
        if (flatListRef.current && images.length > 0) {
          flatListRef.current.scrollToIndex({ index: idx, animated: false });
        }
      }, 50);
    }
  }, [visible, initialIndex, images.length]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / windowWidth);
      if (index >= 0 && index < images.length && index !== currentIndex) {
        setCurrentIndex(index);
      }
    },
    [windowWidth, images.length, currentIndex],
  );

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const nextIdx = currentIndex - 1;
      setCurrentIndex(nextIdx);
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    }
  }, [currentIndex, images.length]);

  if (!visible || images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View className="flex-1 bg-black">
        {/* Top Floating Action Bar */}
        <View
          style={{ paddingTop: Math.max(insets.top, 16) + 8 }}
          className="absolute top-0 left-0 right-0 z-50 px-5 flex-row items-center justify-between pointer-events-box-none"
        >
          {/* Index Counter Pill */}
          {images.length > 1 ? (
            <View className="bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
              <Text className="text-white text-xs font-bold tracking-wider">
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          ) : (
            <View />
          )}

          {/* Close Button */}
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            className="size-10 rounded-full bg-white/20 backdrop-blur-md items-center justify-center border border-white/10"
          >
            <Icon as={XIcon} className="text-white size-5" />
          </TouchableOpacity>
        </View>

        {/* Fullscreen Horizontal Paging Images */}
        <FlatList
          ref={flatListRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, idx) => `${item}-${idx}`}
          onMomentumScrollEnd={handleScroll}
          getItemLayout={(_, idx) => ({
            length: windowWidth,
            offset: windowWidth * idx,
            index: idx,
          })}
          initialScrollIndex={Math.min(initialIndex, Math.max(0, images.length - 1))}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: false });
            }, 100);
          }}
          renderItem={({ item }) => (
            <View
              style={{ width: windowWidth, height: "100%" }}
              className="justify-center items-center px-2"
            >
              <Image
                source={{ uri: item }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
                transition={200}
                cachePolicy="memory-disk"
              />
            </View>
          )}
        />

        {/* Left Arrow (Desktop / Tablet / Optional touch) */}
        {images.length > 1 && currentIndex > 0 && (
          <View
            style={{ position: "absolute", top: 0, bottom: 0, left: 12, justifyContent: "center" }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={goToPrevious}
              activeOpacity={0.7}
              className="size-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 items-center justify-center"
            >
              <Icon as={ChevronLeftIcon} className="text-white/90 size-6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Right Arrow (Desktop / Tablet / Optional touch) */}
        {images.length > 1 && currentIndex < images.length - 1 && (
          <View
            style={{ position: "absolute", top: 0, bottom: 0, right: 12, justifyContent: "center" }}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              onPress={goToNext}
              activeOpacity={0.7}
              className="size-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 items-center justify-center"
            >
              <Icon as={ChevronRightIcon} className="text-white/90 size-6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Pagination Dots */}
        {images.length > 1 && (
          <View
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            className="absolute bottom-0 left-0 right-0 z-50 flex-row justify-center items-center gap-1.5"
            pointerEvents="none"
          >
            {images.map((_, dotIdx) => (
              <View
                key={dotIdx}
                className={`h-1.5 rounded-full transition-all ${
                  currentIndex === dotIdx ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}
