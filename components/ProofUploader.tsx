import React, { useState, useCallback, memo } from 'react';
import { View, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CameraIcon, XIcon, PlusIcon, SendIcon, ImageIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface ProofUploaderProps {
    matchId: Id<"matches">;
    currentDay: number;
    todayProof?: {
        status: string;
        urls?: string[];
        comment?: string;
        rejectionReason?: string;
        canUpload?: boolean;
        canEdit?: boolean;
    } | null;
    onUploadComplete?: () => void;
}

function ProofUploaderComponent({ matchId, currentDay, todayProof, onUploadComplete }: ProofUploaderProps) {
    const [selectedImages, setSelectedImages] = useState<{ uri: string; mimeType?: string }[]>([]);
    const [comment, setComment] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const uploadProofMutation = useMutation(api.matches.uploadProof);

    const handlePickImages = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                selectionLimit: 5 - selectedImages.length,
                quality: 0.8,
            });

            if (!result.canceled && result.assets) {
                const newImages = result.assets.map(asset => ({
                    uri: asset.uri,
                    mimeType: asset.mimeType
                }));

                if (selectedImages.length + newImages.length > 5) {
                    Alert.alert("Limit", "Maximum 5 images allowed");
                    return;
                }

                setSelectedImages(prev => [...prev, ...newImages]);
            }
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    }, [selectedImages.length]);

    const removeImage = useCallback((index: number) => {
        setSelectedImages(images => images.filter((_, i) => i !== index));
    }, []);

    const handleUpload = useCallback(async () => {
        if (selectedImages.length === 0) {
            Alert.alert("Required", "Please select at least 1 image");
            return;
        }

        setIsUploading(true);

        try {
            // Upload all images to R2
            const r2Urls: string[] = [];
            const { uploadImageToR2 } = require('@/utils/image-uploader');

            for (let i = 0; i < selectedImages.length; i++) {
                const image = selectedImages[i];
                const filename = `${i}.webp`;
                const url = await uploadImageToR2(image.uri, `proofs/${matchId}/${currentDay}`, filename);
                r2Urls.push(url);
            }

            // Submit proof with R2 URLs as storageIds
            await uploadProofMutation({
                matchId,
                storageIds: r2Urls,
                day: currentDay,
                type: "image",
                comment: comment.trim() || undefined
            });

            Alert.alert("Success", "Proof uploaded successfully!");
            setSelectedImages([]);
            setComment('');
            onUploadComplete?.();
        } catch (error: any) {
            console.error(error);
            Alert.alert("Error", error.message || "Upload failed");
        } finally {
            setIsUploading(false);
        }
    }, [selectedImages, matchId, currentDay, comment, uploadProofMutation, onUploadComplete]);

    // Memoized upload UI renderer
    const renderUploadUI = useCallback(() => {
        return (
            <View>
                {/* Selected Images Preview */}
                {selectedImages.length > 0 && (
                    <View className="mb-4">
                        <Text className="text-sm font-medium mb-2 text-muted-foreground">
                            Selected Images ({selectedImages.length}/5)
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pt-2">
                            {selectedImages.map((image, index) => (
                                <View key={index} className="relative mr-3">
                                    <Image
                                        source={{ uri: image.uri }}
                                        style={{ width: 96, height: 96, borderRadius: 12 }}
                                        contentFit="cover"
                                        transition={150}
                                    />
                                    <TouchableOpacity
                                        onPress={() => removeImage(index)}
                                        className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                                    >
                                        <Icon as={XIcon} className="text-white size-4" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {selectedImages.length < 5 && (
                                <TouchableOpacity
                                    onPress={handlePickImages}
                                    className="w-24 h-24 rounded-xl border-2 border-dashed border-border items-center justify-center bg-card"
                                >
                                    <Icon as={PlusIcon} className="text-muted-foreground size-8" />
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </View>
                )}

                {/* Upload Area */}
                {selectedImages.length === 0 && (
                    <TouchableOpacity
                        onPress={handlePickImages}
                        className="w-full aspect-video rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 items-center justify-center mb-4"
                    >
                        <Icon as={CameraIcon} className="text-primary size-12 mb-2" />
                        <Text className="text-lg font-bold text-primary">Upload Screenshots</Text>
                        <Text className="text-sm text-muted-foreground mt-1">Up to 5 images</Text>
                    </TouchableOpacity>
                )}

                {/* Comment Input */}
                <View className="mb-4">
                    <Text className="text-sm font-medium mb-2 text-muted-foreground">Add a note (optional)</Text>
                    <TextInput
                        className="bg-secondary p-4 rounded-xl text-foreground"
                        placeholder="e.g., Tested feature X today..."
                        placeholderTextColor="#9ca3af"
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        numberOfLines={2}
                    />
                </View>

                {/* Submit Button */}
                {selectedImages.length > 0 && (
                    <TouchableOpacity
                        onPress={handleUpload}
                        disabled={isUploading}
                        className={`bg-primary p-4 rounded-xl flex-row items-center justify-center ${isUploading ? 'opacity-50' : ''}`}
                    >
                        {isUploading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Icon as={SendIcon} className="text-primary-foreground size-5 mr-2" />
                                <Text className="text-primary-foreground font-bold text-lg">Submit Day {currentDay} Proof</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        );
    }, [selectedImages, comment, isUploading, currentDay, handlePickImages, removeImage, handleUpload]);

    // Show status for already submitted proof
    if (todayProof && todayProof.status) {
        if (todayProof.status === "approved") {
            return (
                <Card className="bg-green-500/10 border-green-500/30 mb-4">
                    <CardContent className="p-4">
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center flex-1">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-6 mr-3" />
                                <View>
                                    <Text className="font-bold text-green-600 text-lg">Day {currentDay} Complete!</Text>
                                    <Text className="text-muted-foreground text-xs">
                                        Your proof has been approved. Great job!
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </CardContent>
                </Card>
            );
        }

        if (todayProof.status === "pending") {
            return (
                <Card className="bg-orange-500/10 border-orange-500/30 mb-6">
                    <CardContent className="p-4">
                        <View className="flex-row items-center mb-3">
                            <Icon as={ClockIcon} className="text-orange-500 size-6 mr-2" />
                            <Text className="font-bold text-orange-600 text-lg">Waiting for Review</Text>
                        </View>
                        <Text className="text-muted-foreground mb-3">
                            Your Day {currentDay} proof is pending approval from your partner.
                        </Text>
                        {todayProof.urls && todayProof.urls.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                                {todayProof.urls.map((url, i) => (
                                    <Image
                                        key={i}
                                        source={{ uri: url }}
                                        style={{ width: 80, height: 80, borderRadius: 8, marginRight: 8 }}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                        transition={150}
                                    />
                                ))}
                            </ScrollView>
                        )}
                        {todayProof.comment && (
                            <Text className="text-sm text-muted-foreground italic">"{todayProof.comment}"</Text>
                        )}
                    </CardContent>
                </Card>
            );
        }

        if (todayProof.status === "rejected") {
            return (
                <View>
                    <Card className="bg-red-500/10 border-red-500/30 mb-4">
                        <CardContent className="p-4">
                            <View className="flex-row items-center mb-2">
                                <Icon as={AlertCircleIcon} className="text-red-500 size-6 mr-2" />
                                <Text className="font-bold text-red-600 text-lg">Proof Rejected</Text>
                            </View>
                            <Text className="text-muted-foreground mb-2">
                                Your Day {currentDay} proof was rejected. Please upload again.
                            </Text>
                            {todayProof.rejectionReason && (
                                <View className="bg-red-500/5 p-3 rounded-lg">
                                    <Text className="text-sm font-medium text-red-600">Reason:</Text>
                                    <Text className="text-sm text-muted-foreground">{todayProof.rejectionReason}</Text>
                                </View>
                            )}
                        </CardContent>
                    </Card>
                    {/* Show upload UI below */}
                    {renderUploadUI()}
                </View>
            );
        }
    }

    return renderUploadUI();
}

// Export memoized component
export const ProofUploader = memo(ProofUploaderComponent);
