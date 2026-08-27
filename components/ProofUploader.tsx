import React, { useState, useCallback, memo } from "react";
import { View, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Dimensions, Pressable } from "react-native";
import { toast } from "@/lib/sonner";
import { Image } from "expo-image";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  CameraIcon,
  UploadIcon,
  XIcon,
  PlusIcon,
  SendIcon,
  ImageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  LockIcon,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useCurrentUser, usePresignedUploadUrl, useSubmitProof } from "@/lib/api-hooks";
import { uploadImageToR2 } from "@/utils/image-uploader";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  isFuture?: boolean;
  isPast?: boolean;
}

function ProofUploaderComponent({ matchId, currentDay, todayProof, onUploadComplete, isCompleted, isFuture, isPast }: ProofUploaderProps) {
  const [selectedImages, setSelectedImages] = useState<{ uri: string; mimeType?: string }[]>([]);
  const [comment, setComment] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isEditingProof, setIsEditingProof] = useState(false);
  const [isConfirmChangeOpen, setIsConfirmChangeOpen] = useState(false);
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
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 5 - selectedImages.length,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset) => ({
          uri: asset.uri,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
        }));

        if (selectedImages.length + newImages.length > 5) {
          toast.info("Limit", { description: "Maximum 5 images allowed" });
          return;
        }

        setSelectedImages((prev) => [...prev, ...newImages]);
      }
    } catch (error: any) {
      toast.error("Error", { description: error.message });
    }
  }, [selectedImages.length]);

  const removeImage = useCallback((index: number) => {
    setSelectedImages((images) => images.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedImages.length === 0) {
      toast.error("Required", { description: "Please select at least 1 image" });
      return;
    }

    if (!user) {
      toast.error("Error", { description: "User data not loaded yet" });
      return;
    }

    setIsUploading(true);
    setUploadStatus("Optimizing screenshots...");

    try {
      let FileSystem: any;
      try {
        FileSystem = require("expo-file-system/legacy");
      } catch {
        FileSystem = require("expo-file-system");
      }

      // 1. Resize and compress to WebP
      const processedImages = await Promise.all(
        selectedImages.map(async (image: { uri: string; width?: number }) => {
          const actions: ImageManipulator.Action[] = [];
          if (image.width && image.width > 1200) {
            actions.push({ resize: { width: 1200 } });
          }

          return await ImageManipulator.manipulateAsync(image.uri, actions, {
            compress: 0.7,
            format: ImageManipulator.SaveFormat.WEBP,
          });
        }),
      );

      // 2. Upload to Cloudflare R2
      setUploadStatus(`Uploading screenshot 1 of ${processedImages.length}...`);
      let uploadedCount = 0;

      const uploadPromises = processedImages.map(async (image, i: number) => {
        const customFilename = `proof_${matchId}_day${currentDay}_${i}_${Date.now()}.webp`;
        try {
          const url = await uploadImageToR2(image.uri, "proofs", customFilename);
          uploadedCount++;
          if (uploadedCount < processedImages.length) {
            setUploadStatus(`Uploading screenshot ${uploadedCount + 1} of ${processedImages.length}...`);
          }
          return url;
        } catch (r2Err) {
          console.warn("Direct R2 upload failed, trying presigned URL:", r2Err);
          const { uploadUrl, publicUrl } = await getPresignedUrlMutation.mutateAsync({
            filename: customFilename,
            contentType: "image/webp",
            folder: "proofs",
          });

          const base64 = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", uploadUrl, true);
            xhr.setRequestHeader("Content-Type", "image/webp");
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                uploadedCount++;
                if (uploadedCount < processedImages.length) {
                  setUploadStatus(`Uploading screenshot ${uploadedCount + 1} of ${processedImages.length}...`);
                }
                resolve();
              } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error("Network error during upload"));

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
      setUploadStatus("Finalizing submission...");
      await submitProofMutation.mutateAsync({
        matchId,
        day: currentDay,
        type: "image",
        storageUrls: uploadedUrls,
        comment: comment.trim() || undefined,
      });

      toast.success("Success", { description: "Proof uploaded successfully!" });
      setSelectedImages([]);
      setComment("");
      setIsEditingProof(false);
      onUploadComplete?.();
    } catch (error: any) {
      console.error(error);
      toast.error("Upload failed", { description: error.message || "Please check your internet connection and retry." });
    } finally {
      setIsUploading(false);
      setUploadStatus("");
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
                  <Pressable onPress={() => openImageViewer(selectedImages.map((img) => img.uri), index)}>
                    <Image
                      source={{ uri: image.uri }}
                      style={{ width: 96, height: 96, borderRadius: 12 }}
                      contentFit="cover"
                      transition={150}
                    />
                  </Pressable>
                  <TouchableOpacity
                    onPress={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 shadow-sm"
                    disabled={isUploading}
                  >
                    <Icon as={XIcon} className="text-destructive-foreground size-3" />
                  </TouchableOpacity>
                </View>
              ))}

              {selectedImages.length < 5 && (
                <TouchableOpacity
                  onPress={handlePickImages}
                  disabled={isUploading}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-border items-center justify-center bg-card"
                >
                  <Icon as={PlusIcon} className="text-muted-foreground size-8" />
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {/* Upload Box when no images are selected */}
        {selectedImages.length === 0 && (
          <TouchableOpacity
            onPress={handlePickImages}
            disabled={isUploading}
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
            className={`bg-primary p-4 rounded-xl flex-row items-center justify-center ${isUploading ? "opacity-75" : ""}`}
          >
            {isUploading ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="white" size="small" />
                <Text className="text-primary-foreground font-bold text-base">
                  {uploadStatus || "Uploading..."}
                </Text>
              </View>
            ) : (
              <>
                <Icon as={SendIcon} className="text-primary-foreground size-5 mr-2" />
                <Text className="text-primary-foreground font-bold text-lg">
                  Submit Day {currentDay} Proof
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }, [selectedImages, comment, isUploading, uploadStatus, currentDay, handlePickImages, removeImage, handleUpload, openImageViewer]);

  // Image viewer modal
  const imageViewerModal = (
    <ImageViewerModal
      visible={viewerVisible}
      images={viewerImages}
      initialIndex={viewerIndex}
      onClose={() => setViewerVisible(false)}
    />
  );

  if (isFuture) {
    return (
      <>
        <Card className="bg-secondary/20 border-border/50 mb-4">
          <CardContent className="p-5 items-center justify-center py-6">
            <View className="w-12 h-12 rounded-full bg-secondary items-center justify-center mb-3">
              <Icon as={LockIcon} className="size-6 text-muted-foreground" />
            </View>
            <Text className="font-bold text-foreground text-base">Day {currentDay} is Locked</Text>
            <Text className="text-muted-foreground text-xs text-center mt-1">This testing day will unlock automatically on Day {currentDay}.</Text>
          </CardContent>
        </Card>
        {imageViewerModal}
      </>
    );
  }

  if (isPast && (!todayProof || todayProof.status === "rejected")) {
    return (
      <>
        <Card className="bg-destructive/5 border-destructive/20 mb-4">
          <CardContent className="p-5 items-center justify-center py-6">
            <View className="w-12 h-12 rounded-full bg-destructive/10 items-center justify-center mb-3">
              <Icon as={AlertCircleIcon} className="size-6 text-destructive" />
            </View>
            <Text className="font-bold text-destructive text-base">Day {currentDay} Missed</Text>
            <Text className="text-muted-foreground text-xs text-center mt-1">
              No proof was submitted for Day {currentDay}. Daily testing must be completed on its active day.
            </Text>
          </CardContent>
        </Card>
        {imageViewerModal}
      </>
    );
  }

  if (isCompleted) {
    if (todayProof && todayProof.status === "approved") {
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
                  {todayProof?.status === "pending" ? "Pending review" : todayProof?.status === "rejected" ? "Was rejected" : "Not uploaded"}
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
    if (todayProof.status === "approved") {
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

    if (todayProof.status === "pending") {
      if (isEditingProof && !isPast) {
        return (
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-bold text-foreground">Re-upload Proof for Day {currentDay}</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsEditingProof(false);
                  setSelectedImages([]);
                }}
                className="px-2.5 py-1 bg-secondary rounded-lg"
              >
                <Text className="text-xs text-muted-foreground font-medium">Cancel</Text>
              </TouchableOpacity>
            </View>
            {renderUploadUI()}
            {imageViewerModal}
          </View>
        );
      }

      return (
        <>
          <Card className="bg-blue-500/10 border-blue-500/30 mb-4">
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <View className="bg-blue-500/20 p-1.5 rounded-full">
                    <Icon as={CheckCircleIcon} className="text-blue-600 dark:text-blue-400 size-4" />
                  </View>
                  <Text className="font-bold text-foreground text-base">Day {currentDay} Uploaded</Text>
                </View>
                <View className="bg-orange-500/15 px-2.5 py-0.5 rounded-full border border-orange-500/30 flex-row items-center gap-1">
                  <Icon as={ClockIcon} className="text-orange-500 size-3" />
                  <Text className="text-[11px] font-bold text-orange-600 dark:text-orange-400">Waiting Review</Text>
                </View>
              </View>
              <Text className="text-muted-foreground text-xs mb-3">Proof submitted successfully! Waiting for your partner to review and approve.</Text>
              {todayProof.urls && todayProof.urls.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                  {todayProof.urls.map((url, i) => (
                    <Pressable key={i} onPress={() => openImageViewer(todayProof.urls!, i)}>
                      <Image
                        source={{ uri: url }}
                        style={{ width: 72, height: 72, borderRadius: 8, marginRight: 8 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {todayProof.comment && (
                <View className="bg-secondary/40 p-2.5 rounded-lg mb-3">
                  <Text className="text-xs text-muted-foreground italic">"{todayProof.comment}"</Text>
                </View>
              )}
              {!isPast && (
                <TouchableOpacity
                  onPress={() => setIsConfirmChangeOpen(true)}
                  className="py-2 px-3 bg-secondary/60 rounded-xl flex-row items-center justify-center border border-border/50 self-start"
                >
                  <Text className="text-xs font-semibold text-foreground">Change Screenshots</Text>
                </TouchableOpacity>
              )}

              {!isPast && (
                <AlertDialog open={isConfirmChangeOpen} onOpenChange={setIsConfirmChangeOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Change Screenshots?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your current proof is pending review. Uploading new screenshots will replace it and reset its status.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        <Text>Cancel</Text>
                      </AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onPress={() => {
                          setIsConfirmChangeOpen(false);
                          setIsEditingProof(true);
                        }}
                      >
                        <Text>Yes, Change</Text>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>
          {imageViewerModal}
        </>
      );
    }

    if (todayProof.status === "rejected") {
      return (
        <>
          <View>
            <Card className="bg-red-500/10 border-red-500/30 mb-4">
              <CardContent className="p-3">
                <View className="flex-row items-center mb-1.5">
                  <Icon as={AlertCircleIcon} className="text-red-500 size-5 mr-2" />
                  <Text className="font-bold text-red-600 text-base">Proof Rejected</Text>
                </View>
                <Text className="text-muted-foreground text-xs mb-2">Your Day {currentDay} proof was rejected. Please upload again.</Text>
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
