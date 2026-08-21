import React, { useState, useCallback, memo } from 'react';
import { View, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Modal, Dimensions, Pressable } from 'react-native';
import { toast } from '@/lib/sonner';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CameraIcon, XIcon, PlusIcon, SendIcon, ImageIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCurrentUser, usePresignedUploadUrl, useSubmitProof } from '@/lib/api-hooks';
import { uploadImageToR2 } from '@/utils/image-uploader';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProofUploaderProps {
    matchId: string;
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
    isCompleted?: boolean;
}

function ProofUploaderComponent({ matchId, currentDay, todayProof, onUploadComplete, isCompleted }: ProofUploaderProps) {
    const [selectedImages, setSelectedImages] = useState<{ uri: string; mimeType?: string }[]>([]);
    const [comment, setComment] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const { data: user } = useCurrentUser();

    // Image viewer state
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImages, setViewerImages] = useState<string[]>([]);
    const [viewerIndex, setViewerIndex] = useState(0);

    const openImageViewer = useCallback((urls: string[], index: number) => {
        setViewerImages(urls);
        setViewerIndex(index);
        setViewerVisible(true);
    }, []);

    const submitProofMutation = useSubmitProof();
    const getPresignedUrlMutation = usePresignedUploadUrl();

    const handlePickImages = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                selectionLimit: 5 - selectedImages.length,
            });

            if (!result.canceled && result.assets) {
                const newImages = result.assets.map(asset => ({
                    uri: asset.uri,
                    mimeType: asset.mimeType,
                    width: asset.width,
                    height: asset.height,
                }));

                if (selectedImages.length + newImages.length > 5) {
                    toast.info("Limit", { description: "Maximum 5 images allowed" });
                    return;
                }

                setSelectedImages(prev => [...prev, ...newImages]);
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        }
    }, [selectedImages.length]);

    const removeImage = useCallback((index: number) => {
        setSelectedImages(images => images.filter((_, i) => i !== index));
    }, []);

    const handleUpload = useCallback(async () => {
        if (selectedImages.length === 0) {
            toast.error('Required', { description: 'Please select at least 1 image' });
            return;
        }

        if (!user) {
            toast.error('Error', { description: 'User data not loaded yet' });
            return;
        }

        setIsUploading(true);

        try {
            const FileSystem = require('expo-file-system/legacy');

            // 1. Resize and compress to WebP
            const processedImages = await Promise.all(
                selectedImages.map(async (image: { uri: string; width?: number }) => {
                    const actions: ImageManipulator.Action[] = [];
                    if (image.width && image.width > 1200) {
                        actions.push({ resize: { width: 1200 } });
                    }

                    return await ImageManipulator.manipulateAsync(
                        image.uri,
                        actions,
                        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
                    );
                })
            );

            // 2. Upload to Cloudflare R2
            const uploadPromises = processedImages.map(async (image, i: number) => {
                const customFilename = `proof_${matchId}_day${currentDay}_${i}_${Date.now()}.webp`;
                try {
                    return await uploadImageToR2(image.uri, "proofs", customFilename);
                } catch (r2Err) {
                    console.warn("Direct R2 upload failed, trying presigned URL:", r2Err);
                    const { uploadUrl, publicUrl } = await getPresignedUrlMutation.mutateAsync({
                        filename: customFilename,
                        contentType: 'image/webp',
                        folder: 'proofs',
                    });

                    const base64 = await FileSystem.readAsStringAsync(image.uri, {
                        encoding: FileSystem.EncodingType.Base64,
                    });

                    await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('PUT', uploadUrl, true);
                        xhr.setRequestHeader('Content-Type', 'image/webp');
                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve();
                            } else {
                                reject(new Error(`Upload failed: ${xhr.status}`));
                            }
                        };
                        xhr.onerror = () => reject(new Error('Upload failed'));

                        const binaryString = atob(base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let j = 0; j < binaryString.length; j++) {
                            bytes[j] = binaryString.charCodeAt(j);
                        }
                        xhr.send(bytes.buffer);
                    });

                    return publicUrl;
                }
            });

            const uploadedUrls = await Promise.all(uploadPromises);

            // 3. Submit proof to backend API
            await submitProofMutation.mutateAsync({
                matchId,
                day: currentDay,
                type: 'image',
                storageUrls: uploadedUrls,
                comment: comment.trim() || undefined,
            });

            toast.success('Success', { description: 'Proof uploaded successfully!' });
            setSelectedImages([]);
            setComment('');
            onUploadComplete?.();
        } catch (error: any) {
            console.error(error);
            toast.error('Upload failed', { description: error.message });
        } finally {
            setIsUploading(false);
        }
    }, [selectedImages, matchId, currentDay, comment, submitProofMutation, getPresignedUrlMutation, onUploadComplete, user]);

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
                        className="w-full rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 items-center justify-center mb-4 p-6"
                    >
                        <Icon as={CameraIcon} className="text-primary size-10 mb-1.5" />
                        <Text className="text-base font-bold text-primary">Upload Screenshots</Text>
                        <Text className="text-xs text-muted-foreground mt-0.5">Up to 5 images</Text>
                    </TouchableOpacity>
                )}

                {/* Comment Input */}
                <View className="mb-4">
                    <TextInput
                        className="bg-secondary p-4 rounded-xl text-foreground"
                        placeholder="Add a note (e.g., Tested feature X today...)"
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

    // Image viewer modal
    const imageViewerModal = (
        <Modal
            visible={viewerVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setViewerVisible(false)}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
                <View style={{ paddingTop: 50, paddingBottom: 10, alignItems: 'center' }}>
                    <Text className="text-white text-center font-medium">
                        {viewerIndex + 1} / {viewerImages.length}
                    </Text>
                </View>

                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    contentOffset={{ x: viewerIndex * SCREEN_WIDTH, y: 0 }}
                    onMomentumScrollEnd={(e) => {
                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                        setViewerIndex(newIndex);
                    }}
                    style={{ flex: 1 }}
                >
                    {viewerImages.map((url, i) => (
                        <View key={i} style={{ width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' }}>
                            <Image
                                source={{ uri: url }}
                                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7 }}
                                contentFit="contain"
                                transition={200}
                            />
                        </View>
                    ))}
                </ScrollView>

                {viewerImages.length > 1 && (
                    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 10, justifyContent: 'center' }} pointerEvents="none">
                        {viewerIndex > 0 && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 8 }}>
                                <Icon as={ChevronLeftIcon} className="text-white/80 size-8" />
                            </View>
                        )}
                    </View>
                )}
                {viewerImages.length > 1 && (
                    <View style={{ position: 'absolute', top: 0, bottom: 0, right: 10, justifyContent: 'center' }} pointerEvents="none">
                        {viewerIndex < viewerImages.length - 1 && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 8 }}>
                                <Icon as={ChevronRightIcon} className="text-white/80 size-8" />
                            </View>
                        )}
                    </View>
                )}

                <View style={{ paddingBottom: 40, paddingTop: 15, alignItems: 'center' }}>
                    <Pressable
                        onPress={() => setViewerVisible(false)}
                        style={{ paddingVertical: 12, paddingHorizontal: 30, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 25 }}
                    >
                        <Text className="text-white font-medium">Close</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );

    if (isCompleted) {
        if (todayProof && todayProof.status === 'approved') {
            return (
                <>
                    <Card className="bg-green-500/10 border-green-500/30 mb-4">
                        <CardContent className="p-3">
                            <View className="flex-row items-center mb-2">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-5 mr-2" />
                                <View className="flex-1">
                                    <Text className="font-bold text-green-600 text-base">Day {currentDay} ✓</Text>
                                    <Text className="text-muted-foreground text-xs">Proof approved</Text>
                                </View>
                            </View>
                            {todayProof.urls && todayProof.urls.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {todayProof.urls.map((url, i) => (
                                        <Pressable key={i} onPress={() => openImageViewer(todayProof.urls!, i)}>
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
                        </CardContent>
                    </Card>
                    {imageViewerModal}
                </>
            );
        }
        return (
            <>
                <Card className="bg-muted/30 border-muted mb-4">
                    <CardContent className="p-3">
                        <View className="flex-row items-center">
                            <Icon as={ImageIcon} className="text-muted-foreground size-5 mr-2" />
                            <View className="flex-1">
                                <Text className="font-medium text-muted-foreground text-sm">Day {currentDay}</Text>
                                <Text className="text-muted-foreground text-xs">
                                    {todayProof?.status === 'pending' ? 'Pending review' :
                                        todayProof?.status === 'rejected' ? 'Was rejected' : 'Not uploaded'}
                                </Text>
                            </View>
                        </View>
                    </CardContent>
                </Card>
                {imageViewerModal}
            </>
        );
    }

    if (todayProof && todayProof.status) {
        if (todayProof.status === 'approved') {
            return (
                <>
                    <Card className="bg-green-500/10 border-green-500/30 mb-4">
                        <CardContent className="p-3">
                            <View className="flex-row items-center mb-2">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-5 mr-2" />
                                <View className="flex-1">
                                    <Text className="font-bold text-green-600 text-base">Day {currentDay} Complete!</Text>
                                    <Text className="text-muted-foreground text-xs">Your proof has been approved</Text>
                                </View>
                            </View>
                            {todayProof.urls && todayProof.urls.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {todayProof.urls.map((url, i) => (
                                        <Pressable key={i} onPress={() => openImageViewer(todayProof.urls!, i)}>
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
                        </CardContent>
                    </Card>
                    {imageViewerModal}
                </>
            );
        }

        if (todayProof.status === 'pending') {
            return (
                <>
                    <Card className="bg-orange-500/10 border-orange-500/30 mb-4">
                        <CardContent className="p-3">
                            <View className="flex-row items-center mb-2">
                                <Icon as={ClockIcon} className="text-orange-500 size-5 mr-2" />
                                <Text className="font-bold text-orange-600 text-base">Waiting for Review</Text>
                            </View>
                            <Text className="text-muted-foreground text-xs mb-2">
                                Your Day {currentDay} proof is pending approval.
                            </Text>
                            {todayProof.urls && todayProof.urls.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                                    {todayProof.urls.map((url, i) => (
                                        <Pressable key={i} onPress={() => openImageViewer(todayProof.urls!, i)}>
                                            <Image
                                                source={{ uri: url }}
                                                style={{ width: 64, height: 64, borderRadius: 6, marginRight: 6 }}
                                                contentFit="cover"
                                                cachePolicy="memory-disk"
                                                transition={150}
                                            />
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            )}
                            {todayProof.comment && (
                                <Text className="text-xs text-muted-foreground italic">"{todayProof.comment}"</Text>
                            )}
                        </CardContent>
                    </Card>
                    {imageViewerModal}
                </>
            );
        }

        if (todayProof.status === 'rejected') {
            return (
                <>
                    <View>
                        <Card className="bg-red-500/10 border-red-500/30 mb-4">
                            <CardContent className="p-3">
                                <View className="flex-row items-center mb-1.5">
                                    <Icon as={AlertCircleIcon} className="text-red-500 size-5 mr-2" />
                                    <Text className="font-bold text-red-600 text-base">Proof Rejected</Text>
                                </View>
                                <Text className="text-muted-foreground text-xs mb-2">
                                    Your Day {currentDay} proof was rejected. Please upload again.
                                </Text>
                                {todayProof.rejectionReason && (
                                    <View className="bg-red-500/5 p-2 rounded-lg">
                                        <Text className="text-xs font-medium text-red-600">Reason:</Text>
                                        <Text className="text-xs text-muted-foreground">{todayProof.rejectionReason}</Text>
                                    </View>
                                )}
                            </CardContent>
                        </Card>
                        {renderUploadUI()}
                    </View>
                    {imageViewerModal}
                </>
            );
        }
    }

    return (
        <>
            {renderUploadUI()}
            {imageViewerModal}
        </>
    );
}

export const ProofUploader = memo(ProofUploaderComponent);
