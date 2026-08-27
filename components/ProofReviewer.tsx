import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, FlatList, Pressable } from "react-native";
import { toast } from "@/lib/sonner";
import { Image } from "expo-image";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CheckCircleIcon, XCircleIcon, ClockIcon, UserIcon, MessageSquareIcon, ImageIcon } from "lucide-react-native";
import { useReviewProof } from "@/lib/api-hooks";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { RatingManager } from "@/lib/rating-manager";

const SCREEN_WIDTH = Dimensions.get("window").width;

const IMAGE_PLACEHOLDER =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7teleayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

interface ProofReviewerProps {
  matchId: string;
  currentDay?: number;
  isPast?: boolean;
  isFuture?: boolean;
  partnerProof?: {
    _id?: string;
    day?: number;
    urls?: string[];
    comment?: string;
    hasPending?: boolean;
    partnerName?: string;
    status?: string;
  } | null;
  onReviewComplete?: () => void;
  onReject?: (proofId: string) => void;
}

function ProofReviewerComponent({ matchId, currentDay, isPast, isFuture, partnerProof, onReviewComplete, onReject }: ProofReviewerProps) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const reviewProofMutation = useReviewProof();

  const handleApprove = useCallback(async () => {
    if (!partnerProof?._id) return;

    setIsReviewing(true);
    try {
      await reviewProofMutation.mutateAsync({
        proofId: partnerProof._id,
        matchId,
        status: "approved",
      });
      toast.success("Approved", { description: "You approved the proof!" });
      onReviewComplete?.();
      RatingManager.recordHappyMomentAndCheckReview("Proof Approved").catch(() => {});
    } catch (error: any) {
      toast.error("Error", { description: error.message });
    } finally {
      setIsReviewing(false);
    }
  }, [partnerProof?._id, matchId, reviewProofMutation, onReviewComplete]);

  const handleRejectPress = useCallback(() => {
    if (!partnerProof?._id) return;
    onReject?.(partnerProof._id);
  }, [partnerProof?._id, onReject]);

  const handleImageSelect = useCallback((index: number) => {
    setCurrentImageIndex(index);
  }, []);

  const isApproved = useMemo(() => partnerProof?.status === "approved", [partnerProof?.status]);
  const images = useMemo(() => partnerProof?.urls || [], [partnerProof?.urls]);

  useEffect(() => {
    if (currentImageIndex >= images.length && images.length > 0) {
      setCurrentImageIndex(0);
    } else if (images.length === 0) {
      setCurrentImageIndex(0);
    }
  }, [images, currentImageIndex]);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(SCREEN_WIDTH - 48);
  const flatListRef = useRef<FlatList>(null);
  const inlineListRef = useRef<FlatList>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!isSyncing && inlineListRef.current && sliderWidth > 0 && currentImageIndex >= 0) {
      inlineListRef.current.scrollToIndex({ index: currentImageIndex, animated: true });
    }
  }, [currentImageIndex, sliderWidth]);

  const handleInlineScroll = (event: any) => {
    if (sliderWidth <= 0 || images.length === 0) return;
    const contentOffset = event.nativeEvent.contentOffset;
    const index = Math.round(contentOffset.x / sliderWidth);
    if (index !== currentImageIndex && index >= 0 && index < images.length) {
      setIsSyncing(true);
      setCurrentImageIndex(index);
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  const handleOpenFullScreen = () => {
    setIsFullScreen(true);
  };

  const handleCloseFullScreen = () => {
    setIsFullScreen(false);
  };

  if (isFuture) {
    return (
      <Card className="bg-secondary/20 border-border/50 mb-6">
        <CardContent className="p-5 items-center justify-center">
          <Text className="text-sm text-muted-foreground text-center">Day {currentDay} testing is locked.</Text>
        </CardContent>
      </Card>
    );
  }

  if (!partnerProof || partnerProof.status === "not_uploaded") {
    if (isPast) {
      return (
        <Card className="bg-secondary/30 mb-6">
          <CardContent className="p-5 items-center">
            <Icon as={ClockIcon} className="text-muted-foreground size-8 mb-2" />
            <Text className="text-sm font-bold text-center">Day {currentDay} Missed</Text>
            <Text className="text-xs text-muted-foreground text-center mt-1">
              {partnerProof?.partnerName || "Your partner"} did not submit proof on Day {currentDay}.
            </Text>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-secondary/30 mb-6">
        <CardContent className="p-6 items-center">
          <Icon as={ClockIcon} className="text-muted-foreground size-12 mb-3" />
          <Text className="text-lg font-bold text-center">Waiting for Partner</Text>
          <Text className="text-muted-foreground text-center mt-1">{partnerProof?.partnerName || "Your partner"} hasn't uploaded today's proof yet.</Text>
        </CardContent>
      </Card>
    );
  }

  if (partnerProof.status === "rejected") {
    if (isPast) {
      return (
        <Card className="bg-secondary/30 mb-6">
          <CardContent className="p-5 items-center">
            <Icon as={XCircleIcon} className="text-muted-foreground size-8 mb-2" />
            <Text className="text-sm font-bold text-center">Day {currentDay} Rejected</Text>
            <Text className="text-xs text-muted-foreground text-center mt-1">
              {partnerProof.partnerName || "Your partner"}'s proof was rejected and the day ended.
            </Text>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-orange-500/10 border-orange-500/30 mb-6">
        <CardContent className="p-4">
          <View className="flex-row items-center mb-2">
            <Icon as={XCircleIcon} className="text-orange-500 size-6 mr-2" />
            <Text className="font-bold text-orange-600 text-lg">Waiting for Re-upload</Text>
          </View>
          <Text className="text-muted-foreground">You rejected {partnerProof.partnerName}'s proof. Waiting for them to upload again.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <View>
      {isApproved && (
        <>
          <Card className="bg-green-500/10 border-green-500/30 mb-4">
            <CardContent className="p-3">
              <View className="flex-row items-center mb-2">
                <Icon as={CheckCircleIcon} className="text-green-500 size-5 mr-2" />
                <View className="flex-1">
                  <Text className="font-bold text-green-600 text-base">Day {partnerProof.day} Complete!</Text>
                  <Text className="text-muted-foreground text-xs">You approved {partnerProof.partnerName}'s proof</Text>
                </View>
              </View>
              {images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {images.map((url, i) => (
                    <Pressable key={i} onPress={handleOpenFullScreen}>
                      <Image
                        source={{ uri: url }}
                        style={{ width: 80, height: 80, borderRadius: 8, marginRight: 8 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {partnerProof.comment && <Text className="text-xs text-muted-foreground italic mt-2">"{partnerProof.comment}"</Text>}
            </CardContent>
          </Card>
        </>
      )}

      {!isApproved && (
        <View>
          <View className="flex-row items-center mb-4">
            <View className="bg-primary/10 p-2 rounded-full mr-3">
              <Icon as={UserIcon} className="text-primary size-5" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-lg">{partnerProof.partnerName}'s Proof</Text>
              <Text className="text-sm text-muted-foreground">Day {partnerProof.day} • Pending your review</Text>
            </View>
          </View>

          {images.length > 0 && (
            <View className="mb-4">
              <View
                className="mb-2 h-96 rounded-xl overflow-hidden bg-muted border border-border relative"
                onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
              >
                <FlatList
                  ref={inlineListRef}
                  data={images}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_item: string, index: number) => `inline-${index}`}
                  onMomentumScrollEnd={handleInlineScroll}
                  getItemLayout={(_data, index) => ({
                    length: sliderWidth,
                    offset: sliderWidth * index,
                    index,
                  })}
                  renderItem={({ item }) => (
                    <TouchableOpacity activeOpacity={0.9} onPress={handleOpenFullScreen} style={{ width: sliderWidth, height: "100%" }}>
                      <Image
                        source={{ uri: item }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="contain"
                        placeholder={IMAGE_PLACEHOLDER}
                        placeholderContentFit="contain"
                        transition={200}
                        cachePolicy="memory-disk"
                      />
                    </TouchableOpacity>
                  )}
                />

                <View className="absolute bottom-3 right-3 bg-black/50 p-1.5 rounded-full pointer-events-none">
                  <Icon as={ImageIcon} className="text-white size-4" />
                </View>
              </View>

              {images.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {images.map((url, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => handleImageSelect(index)}
                      className={`mr-2 rounded-lg overflow-hidden border-2 ${currentImageIndex === index ? "border-primary" : "border-transparent"}`}
                    >
                      <Image
                        source={{ uri: url }}
                        style={{ width: 64, height: 64 }}
                        contentFit="cover"
                        placeholder={IMAGE_PLACEHOLDER}
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View className="absolute right-2 top-2 bg-black/60 px-2 py-1 rounded-full pointer-events-none">
                <Text className="text-white text-xs font-bold">
                  {currentImageIndex + 1}/{images.length}
                </Text>
              </View>
            </View>
          )}

          {partnerProof.comment && (
            <Card className="bg-secondary/20 mb-4">
              <CardContent className="p-3 flex-row">
                <Icon as={MessageSquareIcon} className="text-muted-foreground size-4 mr-2 mt-0.5" />
                <Text className="text-sm text-foreground flex-1 italic">"{partnerProof.comment}"</Text>
              </CardContent>
            </Card>
          )}

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleApprove}
              disabled={isReviewing}
              className="flex-1 bg-green-500 p-4 rounded-xl flex-row items-center justify-center"
            >
              {isReviewing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Icon as={CheckCircleIcon} className="text-white size-5 mr-2" />
                  <Text className="text-white font-bold text-lg">Accept</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRejectPress}
              disabled={isReviewing}
              className="flex-1 bg-red-500 p-4 rounded-xl flex-row items-center justify-center"
            >
              <Icon as={XCircleIcon} className="text-white size-5 mr-2" />
              <Text className="text-white font-bold text-lg">Reject</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-xs text-muted-foreground text-center mt-3">
            Accept if the screenshot shows genuine app usage. Reject if it looks fake or insufficient.
          </Text>
        </View>
      )}

      <ImageViewerModal
        visible={isFullScreen}
        images={images}
        initialIndex={currentImageIndex}
        onClose={handleCloseFullScreen}
      />
    </View>
  );
}

export const ProofReviewer = memo(ProofReviewerComponent);
