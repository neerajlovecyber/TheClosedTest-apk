import React from 'react';
import { View, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, XCircleIcon, ClockIcon, UserIcon, MessageSquareIcon, ImageIcon } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useState } from 'react';

const SCREEN_WIDTH = Dimensions.get('window').width;

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

export function ProofReviewer({ matchId, partnerProof, onReviewComplete, onReject }: ProofReviewerProps) {
    const [isReviewing, setIsReviewing] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    const reviewProofMutation = useMutation(api.matches.reviewProof);

    const handleApprove = async () => {
        if (!partnerProof?._id) return;

        setIsReviewing(true);
        try {
            await reviewProofMutation({
                proofId: partnerProof._id,
                status: "approved"
            });
            Alert.alert("Approved!", "You approved the proof.");
            onReviewComplete?.();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setIsReviewing(false);
        }
    };

    const handleRejectPress = () => {
        if (!partnerProof?._id) return;
        onReject?.(partnerProof._id);
    };

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

    // Already approved
    if (partnerProof.status === "approved") {
        return (
            <Card className="bg-green-500/10 border-green-500/30 mb-6">
                <CardContent className="p-4">
                    <View className="flex-row items-center mb-2">
                        <Icon as={CheckCircleIcon} className="text-green-500 size-6 mr-2" />
                        <Text className="font-bold text-green-600 text-lg">Approved!</Text>
                    </View>
                    <Text className="text-muted-foreground">
                        You approved {partnerProof.partnerName}'s Day {partnerProof.day} proof.
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

    // Pending review - show full review UI

    const images = partnerProof.urls || [];

    return (
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

            {/* Image Gallery */}
            {images.length > 0 && (
                <View className="mb-4">
                    {/* Main Image - Portrait orientation for mobile screenshots */}
                    <View className="rounded-xl overflow-hidden bg-muted mb-2">
                        <Image
                            source={{ uri: images[currentImageIndex] }}
                            className="w-full aspect-[9/16]"
                            resizeMode="contain"
                        />
                    </View>

                    {/* Image Thumbnails */}
                    {images.length > 1 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {images.map((url, index) => (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => setCurrentImageIndex(index)}
                                    className={`mr-2 rounded-lg overflow-hidden border-2 ${currentImageIndex === index ? 'border-primary' : 'border-transparent'
                                        }`}
                                >
                                    <Image
                                        source={{ uri: url }}
                                        className="w-16 h-16"
                                    />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {/* Image Counter */}
                    <View className="absolute right-2 top-2 bg-black/60 px-2 py-1 rounded-full">
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

            {/* Help Text */}
            <Text className="text-xs text-muted-foreground text-center mt-3">
                Accept if the screenshot shows genuine app usage. Reject if it looks fake or insufficient.
            </Text>
        </View>
    );
}
