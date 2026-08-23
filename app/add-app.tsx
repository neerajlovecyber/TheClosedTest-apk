import React, { useState } from "react";
import { View, Platform, TouchableOpacity, ActivityIndicator, Image, Pressable, Share } from "react-native";
import { toast } from "@/lib/sonner";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeftIcon, UploadIcon, ImagePlusIcon, CheckCircleIcon, SendIcon, CopyIcon, CheckIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { GoogleGroupWidget } from "@/components/GoogleGroupWidget";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCreateApp, usePresignedUploadUrl, useCurrentUser } from "@/lib/api-hooks";
import { uploadImageToR2 } from "@/utils/image-uploader";

const GOOGLE_GROUP_EMAIL = "developers-community-official@googlegroups.com";

function CopyableEmail() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Share.share({ message: GOOGLE_GROUP_EMAIL });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.log("Share error:", error);
    }
  };

  return (
    <Pressable onPress={handleCopy} className="flex-row items-center justify-between p-3 rounded-xl bg-primary/10 active:bg-primary/20 mb-3">
      <View className="flex-1 mr-3">
        <Text className="text-xs text-muted-foreground mb-1">Tap to share/copy email</Text>
        <Text className="text-sm font-mono font-bold text-foreground" numberOfLines={1}>
          {GOOGLE_GROUP_EMAIL}
        </Text>
      </View>
      <View className={`w-9 h-9 rounded-full items-center justify-center ${copied ? "bg-green-500" : "bg-primary"}`}>
        <Icon as={copied ? CheckIcon : CopyIcon} className="text-white size-4" />
      </View>
    </Pressable>
  );
}

export default function AddAppScreen() {
  const router = useRouter();

  const createAppMutation = useCreateApp();
  const getPresignedUrlMutation = usePresignedUploadUrl();
  const { data: currentUser } = useCurrentUser();

  const [title, setTitle] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");
  const [packageName, setPackageName] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [requiredTesters, setRequiredTesters] = useState("12");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAddedEmail, setHasAddedEmail] = useState(false);
  const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);

  React.useEffect(() => {
    const match = playStoreUrl.match(/id=([a-zA-Z0-9_.]+)/);
    if (match && match[1]) {
      setPackageName(match[1]);
    } else {
      setPackageName("");
    }
  }, [playStoreUrl]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      setProcessedImageUri(uri);
      optimizeImage(uri);
    }
  };

  const optimizeImage = async (uri: string) => {
    try {
      const result = await manipulateAsync(uri, [{ resize: { width: 128, height: 128 } }], {
        compress: 0.8,
        format: SaveFormat.WEBP,
      });
      setProcessedImageUri(result.uri);
    } catch (error) {
      console.error("Optimization failed:", error);
    }
  };

  const handleSubmit = async () => {
    if (!processedImageUri) {
      toast.error("Error", { description: "Please upload an app icon" });
      return;
    }

    if (!title || !playStoreUrl || !instructions) {
      toast.error("Error", { description: "Please fill in all required fields" });
      return;
    }

    const isMember = Boolean(currentUser?.isGroupMember || currentUser?.googleGroupConfirmed);
    if (!isMember) {
      toast.info("Requirement", { description: "You must join the Google Group first." });
      return;
    }

    if (!hasAddedEmail) {
      toast.info("Requirement", {
        description: "You must confirm you have added the group email to your testers list.",
      });
      return;
    }

    if (!packageName) {
      toast.error("Error", {
        description: "Invalid Play Store link. Could not extract package name.",
      });
      return;
    }

    const testers = parseInt(requiredTesters);
    if (isNaN(testers) || testers < 1 || testers > 12) {
      toast.error("Error", {
        description: "Please enter a number between 1 and 12 for required testers",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalIconUrl = "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=160&auto=format&fit=crop&q=80";

      // Upload icon to Cloudflare R2
      if (processedImageUri) {
        try {
          finalIconUrl = await uploadImageToR2(processedImageUri, "icons");
        } catch (r2Err) {
          console.warn("Direct R2 upload failed, trying presigned URL:", r2Err);
          try {
            const { uploadUrl, publicUrl } = await getPresignedUrlMutation.mutateAsync({
              filename: `app_${Date.now()}_icon.webp`,
              contentType: "image/webp",
              folder: "icons",
            });

            const FileSystem = require("expo-file-system/legacy");
            const base64 = await FileSystem.readAsStringAsync(processedImageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", uploadUrl, true);
              xhr.setRequestHeader("Content-Type", "image/webp");
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
                } else {
                  reject(new Error(`Upload failed: ${xhr.status}`));
                }
              };
              xhr.onerror = () => reject(new Error("Upload failed"));

              const binaryString = atob(base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              xhr.send(bytes.buffer);
            });

            finalIconUrl = publicUrl;
          } catch (presignedErr) {
            console.error("Presigned upload failed too:", presignedErr);
          }
        }
      }

      // Create App in PostgreSQL database
      await createAppMutation.mutateAsync({
        title,
        packageName: packageName || "com.unknown.package",
        playStoreUrl,
        iconUrl: finalIconUrl,
        instructions,
        requiredTesters: testers,
      });

      toast.success("Success", { description: "App added successfully!" });
      router.back();
    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error("Error", { description: error.message || "Failed to add app" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addInstruction = (text: string) => {
    setInstructions((prev) => (prev ? `${prev}\n- ${text}` : `- ${text}`));
  };

  return (
    <View className="flex-1 bg-background pt-12">
      <View className="flex-row items-center px-4 pb-4 border-b border-border">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
        </Button>
        <Text className="text-xl font-bold ml-2">Add New App</Text>
      </View>

      <KeyboardAwareScrollView bottomOffset={Platform.OS === "ios" ? 100 : 80} className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Prerequisites */}
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/50">
          <CardContent className="p-4 gap-4">
            <Text className="text-xl font-semibold leading-none tracking-tight text-amber-800 dark:text-amber-200">Prerequisites</Text>
            <View>
              <Text className="font-semibold mb-2 text-foreground">1. Join Community</Text>
              <View className="gap-1.5">
                <GoogleGroupWidget className="mb-0" />
                <TouchableOpacity
                  onPress={() => {
                    const { Linking } = require("react-native");
                    Linking.openURL("https://t.me/developers_community_official/1");
                  }}
                  className="flex-row items-center gap-3 bg-sky-500 p-3 rounded-xl"
                  style={{ elevation: 2 }}
                  activeOpacity={0.8}
                >
                  <View className="bg-white/25 p-2 rounded-lg">
                    <Icon as={SendIcon} className="text-white size-4" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-bold text-sm">Join Telegram Community</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View>
              <Text className="font-semibold mb-2 text-foreground">2. Play Console Setup</Text>
              <Text className="text-sm text-muted-foreground mb-3">
                ⚠️ Your app won't be visible to testers unless you add the group email below to your Closed Testing track in Google Play Console.
              </Text>

              <View
                className="bg-white dark:bg-card p-3 rounded-xl mb-3 border border-primary/30"
                style={{
                  elevation: 3,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                }}
              >
                <CopyableEmail />
                <Image source={require("@/assets/images/guide/addthegooglegrp.png")} className="w-full h-32 rounded-lg mt-2" resizeMode="contain" />
              </View>

              <TouchableOpacity
                onPress={() => router.push("/playstore-guide" as any)}
                className="flex-row items-center gap-3 bg-blue-600 p-2 rounded-2xl mb-4"
                style={{
                  elevation: 4,
                  shadowColor: "#3b82f6",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                }}
                activeOpacity={0.8}
              >
                <View className="bg-white/25 p-3 rounded-xl">
                  <Icon as={CheckCircleIcon} className="text-white size-6" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-bold text-base">📖 View Step-by-Step Guide</Text>
                </View>
              </TouchableOpacity>

              <View
                className={`flex-row items-center gap-4 p-2 pl-5 rounded-2xl border-2 ${hasAddedEmail ? "bg-green-500/10 border-green-500" : "bg-orange-500/10 border-orange-400 animate-pulse"}`}
              >
                <Switch checked={hasAddedEmail} onCheckedChange={setHasAddedEmail} className="scale-150" />
                <View className="flex-1">
                  <Text className={`text-base font-bold ${hasAddedEmail ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400"}`}>
                    {hasAddedEmail ? "✓ Confirmed!" : "⚠️ Required Confirmation"}
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-0.5">I have added the group email to my testers list</Text>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>App Details</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="mb-6 items-center">
              <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
                {processedImageUri ? (
                  <View className="relative">
                    <Image source={{ uri: processedImageUri }} className="size-28 rounded-2xl border-2 border-primary/20" />
                    <View className="absolute -top-2 -right-2 bg-background rounded-full p-1 border border-border shadow-sm">
                      <Icon as={UploadIcon} className="size-4 text-primary" />
                    </View>
                  </View>
                ) : (
                  <View className="size-28 rounded-2xl bg-muted/50 border-2 border-dashed border-muted-foreground/30 items-center justify-center gap-2">
                    <Icon as={ImagePlusIcon} className="size-8 text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground font-medium">
                      Upload Icon <Text className="text-red-500">*</Text>
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View>
              <Label nativeID="appName" className="text-base font-semibold mb-1.5">
                App Name (max 30)
              </Label>
              <Input
                nativeID="appName"
                placeholder="e.g. Flappy Bird 2"
                value={title}
                onChangeText={setTitle}
                maxLength={30}
                className="bg-background/50 border-primary/20 focus:border-primary"
              />
              <Text className="text-xs text-muted-foreground text-right mt-1">{title.length}/30</Text>
            </View>

            <View>
              <Label nativeID="playUrl" className="text-base font-semibold mb-1.5">
                Google Play Link
              </Label>
              <Input
                nativeID="playUrl"
                placeholder="https://play.google.com/..."
                value={playStoreUrl}
                onChangeText={setPlayStoreUrl}
                maxLength={200}
                className="bg-background/50 border-primary/20 focus:border-primary"
              />
              {packageName ? (
                <Text className="text-xs text-green-600 mt-1 font-medium">Detected Package: {packageName}</Text>
              ) : (
                <Text className="text-xs text-muted-foreground mt-1">Paste ID link to auto-detect package name</Text>
              )}
            </View>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Testing Requirements</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <View>
              <Label nativeID="testers">Testers Needed (max 12) *</Label>
              <Input nativeID="testers" keyboardType="numeric" value={requiredTesters} onChangeText={setRequiredTesters} placeholder="12" />
            </View>

            <View>
              <Label nativeID="instructions">Instructions for Testers (max 250) *</Label>
              <Textarea
                nativeID="instructions"
                placeholder="Explain how to test your app..."
                value={instructions}
                onChangeText={setInstructions}
                maxLength={250}
                className="h-32"
              />
              <Text className="text-xs text-muted-foreground text-right mt-1">{instructions.length}/250</Text>
              <View className="flex-row flex-wrap gap-2 mt-3">
                <Button variant="outline" size="sm" onPress={() => addInstruction("Keep installed for 14 days")}>
                  <Text>+ 14 Days</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={() => addInstruction("Open daily")}>
                  <Text>+ Open Daily</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={() => addInstruction("Leave constructive feedback")}>
                  <Text>+ Feedback</Text>
                </Button>
                <Button variant="outline" size="sm" onPress={() => addInstruction("Upload screenshot")}>
                  <Text>+ Screenshot</Text>
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>

        <Button size="lg" onPress={handleSubmit} disabled={isSubmitting} className="mb-8">
          {isSubmitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="white" size="small" />
              <Text>Uploading...</Text>
            </View>
          ) : (
            <Text>Add App</Text>
          )}
        </Button>
      </KeyboardAwareScrollView>
    </View>
  );
}
