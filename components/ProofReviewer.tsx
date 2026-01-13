import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Dimensions, Modal, FlatList } from 'react-native';
import Toast from 'react-native-toast-message';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, XCircleIcon, ClockIcon, UserIcon, MessageSquareIcon, ImageIcon } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useSmartMutation } from '@/hooks/useSmartMutation';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Blurhash placeholder for images
const IMAGE_PLACEHOLDER = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7teleayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

interface ProofReviewerProps {
    matchId: Id<"matches">;
    partnerProof?: {
        _id?: Id<"proofs">;
        day?: number;
        urls?: string[];
        comment?: string;
        hasPending?: boolean;
        partnerName?: string;
        status?: string;
    } | null;
    onReviewComplete?: () => void;
    onReject?: (proofId: Id<"proofs">) => void;
}

function ProofReviewerComponent({ matchId, partnerProof, onReviewComplete, onReject }: ProofReviewerProps) {
    const [isReviewing, setIsReviewing] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    const reviewProof = useSmartMutation(api.matches.reviewProof, ['matches']);

    const handleApprove = useCallback(async () => {
        if (!partnerProof?._id) return;

        setIsReviewing(true);
        try {
            await reviewProof({
                proofId: partnerProof._id,
                status: "approved"
            });
            Toast.show({ type: 'success', text1: 'Approved', text2: 'You approved the proof!' });
            // Cache automatically invalidated
            onReviewComplete?.();
        } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message });
        } finally {
            setIsReviewing(false);
        }
    }, [partnerProof?._id, reviewProof, onReviewComplete]);

    const handleRejectPress = useCallback(() => {
        if (!partnerProof?._id) return;
        onReject?.(partnerProof._id);
    }, [partnerProof?._id, onReject]);

    const handleImageSelect = useCallback((index: number) => {
        setCurrentImageIndex(index);
    }, []);

    // Memoize computed values
    const isApproved = useMemo(() => partnerProof?.status === "approved", [partnerProof?.status]);
    const images = useMemo(() => partnerProof?.urls || [], [partnerProof?.urls]);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(SCREEN_WIDTH - 48); // Approximate initial width (Screen - padding)
    const flatListRef = useRef<FlatList>(null);
    const inlineListRef = useRef<FlatList>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // Sync inline list when index changes (e.g. via thumbnail click)
    useEffect(() => {
        if (!isSyncing && inlineListRef.current && sliderWidth > 0 && currentImageIndex >= 0) {
            inlineListRef.current.scrollToIndex({ index: currentImageIndex, animated: true });
        }
    }, [currentImageIndex, sliderWidth]);

    const handleInlineScroll = (event: any) => {
        if (sliderWidth <= 0) return;
        const contentOffset = event.nativeEvent.contentOffset;
        const index = Math.round(contentOffset.x / sliderWidth);
        if (index !== currentImageIndex && index >= 0 && index < images.length) {
            setIsSyncing(true);
            setCurrentImageIndex(index);
            // Reset syncing flag after animation
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleOpenFullScreen = () => {
        setIsFullScreen(true);
    };

    const handleCloseFullScreen = () => {
        setIsFullScreen(false);
    };

    const handleScrollEnd = (event: any) => {
        const contentOffset = event.nativeEvent.contentOffset;
        const index = Math.round(contentOffset.x / SCREEN_WIDTH);
        if (index !== currentImageIndex && index >= 0 && index < images.length) {
            setCurrentImageIndex(index);
        }
    };

    // Sync FlatList position when modal opens
    useEffect(() => {
        if (isFullScreen && flatListRef.current && images.length > 0) {
            // Small timeout to allow layout to compute
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: currentImageIndex, animated: false });
            }, 100);
        }
    }, [isFullScreen]);

    // Partner hasn't uploaded yet
    if (!partnerProof || partnerProof.status === "not_uploaded") {
        return (
            <Card className="bg-secondary/30 mb-6">
                <CardContent className="p-6 items-center">
                    <Icon as={ClockIcon} className="text-muted-foreground size-12 mb-3" />
                    <Text className="text-lg font-bold text-center">Waiting for Partner</Text>
                    <Text className="text-muted-foreground text-center mt-1">
                        {partnerProof?.partnerName || "Your partner"} hasn't uploaded today's proof yet.
                    </Text>
                </CardContent>
            </Card>
        );
    }


    // Already rejected (partner needs to re-upload)
    if (partnerProof.status === "rejected") {
        return (
            <Card className="bg-orange-500/10 border-orange-500/30 mb-6">
                <CardContent className="p-4">
                    <View className="flex-row items-center mb-2">
                        <Icon as={XCircleIcon} className="text-orange-500 size-6 mr-2" />
                        <Text className="font-bold text-orange-600 text-lg">Waiting for Re-upload</Text>
                    </View>
                    <Text className="text-muted-foreground">
                        You rejected {partnerProof.partnerName}'s proof. Waiting for them to upload again.
                    </Text>
                </CardContent>
            </Card>
        );
    }



    // ... existing renders ...

    return (
        <View>
            {/* Approved State Summary Card */}
            {isApproved && (
                <Card className="bg-green-500/10 border-green-500/30 mb-4">
                    <CardContent className="p-4">
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-6 mr-3" />
                                <View>
                                    <Text className="font-bold text-green-600 text-lg">Day {partnerProof.day} Complete!</Text>
                                    <Text className="text-muted-foreground text-xs">
                                        You approved this proof.
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </CardContent>
                </Card>
            )}

            {/* Main Content (Images & Details) */}
            {!isApproved && (
                <View>
                    {/* Header */}
                    <View className="flex-row items-center mb-4">
                        <View className="bg-primary/10 p-2 rounded-full mr-3">
                            <Icon as={UserIcon} className="text-primary size-5" />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-lg">{partnerProof.partnerName}'s Proof</Text>
                            <Text className="text-sm text-muted-foreground">Day {partnerProof.day} • Pending your review</Text>
                        </View>
                    </View>

                    {/* Image Gallery with expo-image caching */}
                    {images.length > 0 && (
                        <View className="mb-4">
                            {/* Main Image - Clickable for Full Screen */}
                            {/* Main Image Slider - Swipeable */}
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
                                        <TouchableOpacity
                                            activeOpacity={0.9}
                                            onPress={handleOpenFullScreen}
                                            style={{ width: sliderWidth, height: '100%' }}
                                        >
                                            <Image
                                                source={{ uri: item }}
                                                style={{ width: '100%', height: '100%' }}
                                                contentFit="contain"
                                                placeholder={IMAGE_PLACEHOLDER}
                                                placeholderContentFit="contain"
                                                transition={200}
                                                cachePolicy="memory-disk"
                                            />
                                        </TouchableOpacity>
                                    )}
                                />

                                {/* Zoom Hint Overlay - Always visible on top */}
                                <View className="absolute bottom-3 right-3 bg-black/50 p-1.5 rounded-full pointer-events-none">
                                    <Icon as={ImageIcon} className="text-white size-4" />
                                </View>
                            </View>

                            {/* Image Thumbnails */}
                            {images.length > 1 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {images.map((url, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            onPress={() => handleImageSelect(index)}
                                            className={`mr-2 rounded-lg overflow-hidden border-2 ${currentImageIndex === index ? 'border-primary' : 'border-transparent'
                                                }`}
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

                            {/* Image Counter */}
                            <View className="absolute right-2 top-2 bg-black/60 px-2 py-1 rounded-full pointer-events-none">
                                <Text className="text-white text-xs font-bold">
                                    {currentImageIndex + 1}/{images.length}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Partner's Comment */}
                    {partnerProof.comment && (
                        <Card className="bg-secondary/20 mb-4">
                            <CardContent className="p-3 flex-row">
                                <Icon as={MessageSquareIcon} className="text-muted-foreground size-4 mr-2 mt-0.5" />
                                <Text className="text-sm text-foreground flex-1 italic">"{partnerProof.comment}"</Text>
                            </CardContent>
                        </Card>
                    )}

                    {/* Action Buttons */}
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

            {/* Full Screen Image Modal */}
            <Modal
                visible={isFullScreen}
                transparent={true}
                animationType="fade"
                onRequestClose={handleCloseFullScreen}
            >
                <View className="flex-1 bg-black">
                    {/* Close Button */}
                    <TouchableOpacity
                        onPress={handleCloseFullScreen}
                        className="absolute top-12 right-4 z-50 bg-black/50 p-2 rounded-full"
                    >
                        <Icon as={XCircleIcon} className="text-white size-8" />
                    </TouchableOpacity>

                    {/* Page Counter */}
                    <View className="absolute top-12 left-4 z-50 bg-black/50 px-3 py-1 rounded-full">
                        <Text className="text-white font-bold">
                            {currentImageIndex + 1} / {images.length}
                        </Text>
                    </View>

                    <FlatList
                        ref={flatListRef}
                        data={images}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(_item: string, index: number) => index.toString()}
                        onMomentumScrollEnd={handleScrollEnd}
                        getItemLayout={(_data: any, index: number) => (
                            { length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index }
                        )}
                        initialScrollIndex={currentImageIndex}
                        renderItem={({ item }: { item: string }) => (
                            <View style={{ width: SCREEN_WIDTH, height: '100%', justifyContent: 'center' }}>
                                <Image
                                    source={{ uri: item }}
                                    style={{ width: '100%', height: '100%' }}
                                    contentFit="contain"
                                    cachePolicy="memory-disk"
                                />
                            </View>
                        )}
                    />
                </View>
            </Modal>
        </View>
    );
}

// Export memoized component
export const ProofReviewer = memo(ProofReviewerComponent);
