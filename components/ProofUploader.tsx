import React, { useState } from 'react';
import { View, TouchableOpacity, Image, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
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

export function ProofUploader({ matchId, currentDay, todayProof, onUploadComplete }: ProofUploaderProps) {
    const [selectedImages, setSelectedImages] = useState<{ uri: string; mimeType?: string }[]>([]);
    const [comment, setComment] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const uploadProofMutation = useMutation(api.matches.uploadProof);

    const handlePickImages = async () => {
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

                setSelectedImages([...selectedImages, ...newImages]);
            }
        } catch (error: any) {
            Alert.alert("Error", error.message);
        }
    };

    const removeImage = (index: number) => {
        setSelectedImages(images => images.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (selectedImages.length === 0) {
            Alert.alert("Required", "Please select at least 1 image");
            return;
        }

        setIsUploading(true);

        try {
            // Upload all images to storage
            const storageIds: string[] = [];

            for (const image of selectedImages) {
                const postUrl = await generateUploadUrl();
                const response = await fetch(postUrl, {
                    method: "POST",
                    headers: { "Content-Type": image.mimeType || "image/jpeg" },
                    body: await (await fetch(image.uri)).blob(),
                });

                if (!response.ok) throw new Error("Upload failed");
                const { storageId } = await response.json();
                storageIds.push(storageId);
            }

            // Submit proof with all storage IDs
            await uploadProofMutation({
                matchId,
                storageIds,
                day: currentDay,
                type: "image",
                comment: comment.trim() || undefined
            });

            Alert.alert("Success", "Proof uploaded successfully!");
            setSelectedImages([]);
            setComment('');
            onUploadComplete?.();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setIsUploading(false);
        }
    };

    // Show status for already submitted proof
    if (todayProof && todayProof.status) {
        if (todayProof.status === "approved") {
            return (
                <Card className="bg-green-500/10 border-green-500/30 mb-6">
                    <CardContent className="p-4">
                        <View className="flex-row items-center mb-3">
                            <Icon as={CheckCircleIcon} className="text-green-500 size-6 mr-2" />
                            <Text className="font-bold text-green-600 text-lg">Day {currentDay} Complete!</Text>
                        </View>
                        <Text className="text-muted-foreground">Your proof has been approved. Great job!</Text>
                        {todayProof.urls && todayProof.urls.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                                {todayProof.urls.map((url, i) => (
                                    <Image key={i} source={{ uri: url }} className="w-20 h-20 rounded-lg mr-2" />
                                ))}
                            </ScrollView>
                        )}
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
                                    <Image key={i} source={{ uri: url }} className="w-20 h-20 rounded-lg mr-2" />
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

    // Render upload UI
    function renderUploadUI() {
        return (
            <View>
                {/* Selected Images Preview */}
                {selectedImages.length > 0 && (
                    <View className="mb-4">
                        <Text className="text-sm font-medium mb-2 text-muted-foreground">
                            Selected Images ({selectedImages.length}/5)
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {selectedImages.map((image, index) => (
                                <View key={index} className="relative mr-3">
                                    <Image
                                        source={{ uri: image.uri }}
                                        className="w-24 h-24 rounded-xl"
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
    }

    return renderUploadUI();
}
