
import React, { useState } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useInvalidateQueries } from '@/hooks/useInvalidateQueries';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftIcon, UploadIcon, ImagePlusIcon, XIcon, CheckCircleIcon, SendIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export default function AddAppScreen() {
    const router = useRouter();

    const createApp = useMutation(api.apps.createApp);
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const currentUser = useQuery(api.users.getCurrentUser);

    // Cache invalidation
    const { invalidateApps } = useInvalidateQueries();

    const [title, setTitle] = useState('');
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [packageName, setPackageName] = useState(''); // Extracted from URL
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [instructions, setInstructions] = useState('');
    const [requiredTesters, setRequiredTesters] = useState('12');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasAddedEmail, setHasAddedEmail] = useState(false);

    // Processed image URI to display/upload
    const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);

    const updateApp = useMutation(api.apps.updateApp);
    // Auto-extract package name
    React.useEffect(() => {
        const match = playStoreUrl.match(/id=([a-zA-Z0-9_.]+)/);
        if (match && match[1]) {
            setPackageName(match[1]);
        } else {
            setPackageName('');
        }
    }, [playStoreUrl]);

    const syncAppCount = useMutation(api.users.syncAppCount);
    React.useEffect(() => {
        // Sync app count on mount to ensure accuracy
        syncAppCount().then((count) => console.log("Synced app count:", count));
    }, []);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.canceled) {
            const uri = result.assets[0].uri;
            setSelectedImage(uri);
            // Instant feedback: Show raw image immediately
            setProcessedImageUri(uri);

            // Optimize in background
            // We don't await this to prevent blocking the UI, but relying on state update
            optimizeImage(uri);
        }
    };

    const optimizeImage = async (uri: string) => {
        try {
            const result = await manipulateAsync(
                uri,
                [{ resize: { width: 128, height: 128 } }],
                { compress: 0.8, format: SaveFormat.WEBP }
            );
            setProcessedImageUri(result.uri);
        } catch (error) {
            console.error("Optimization failed:", error);
            // If optimization fails, we kept the original URI anyway
        }
    };

    const handleSubmit = async () => {
        if (!processedImageUri) {
            Alert.alert('Error', 'Please upload an app icon');
            return;
        }

        if (!title || !playStoreUrl || !instructions) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        if (!currentUser?.isGroupMember) {
            Alert.alert('Requirement', 'You must join the Google Group first.');
            return;
        }

        if (!hasAddedEmail) {
            Alert.alert('Requirement', 'You must confirm you have added the group email to your testers list.');
            return;
        }

        if (!packageName) {
            Alert.alert('Error', 'Invalid Play Store link. Could not extract package name.');
            return;
        }

        const testers = parseInt(requiredTesters);
        if (isNaN(testers) || testers < 0 || testers > 12) {
            Alert.alert('Error', 'Please enter a number between 0 and 12 for required testers');
            return;
        }

        setIsSubmitting(true);
        try {
            let storageId = null;

            // 1. Create App first with placeholder or default
            const appId = await createApp({
                title,
                packageName: packageName || "com.unknown.package",
                playStoreUrl,
                iconUrl: "https://github.com/shadcn.png", // Default initially
                storageId: undefined,
                instructions,
                requiredTesters: testers,
            });

            // 2. Upload Image if selected, using App ID as filename
            if (processedImageUri) {
                try {
                    const { uploadImageToR2 } = require('@/utils/image-uploader');
                    // Use deterministic filename: app-icons/<appId>.webp (appId is standard ID string)
                    // This allows overwriting/updating easily
                    const uploadUrl = await uploadImageToR2(processedImageUri, "app-icons", `${appId}.webp`);

                    // 3. Update App with real icon URL
                    await updateApp({
                        appId: appId,
                        iconUrl: uploadUrl
                    });
                } catch (uploadError: any) {
                    console.error("Upload failed but app created:", uploadError);
                    Alert.alert("Warning", "App created but icon upload failed: " + uploadError.message);
                    // Optionally delete app if critical
                }
            }

            // To properly call updateApp, I need to add `const updateApp = useMutation(api.apps.updateApp);` at component top.
            // I will return for now and fix imports in next step.


            // Invalidate caches so new app appears immediately in home and marketplace
            invalidateApps();

            Alert.alert('Success', 'App added successfully!');
            router.back();
        } catch (error: any) {
            console.error("Submit error:", error);
            Alert.alert('Error', error.message || 'Failed to add app');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addInstruction = (text: string) => {
        setInstructions(prev => prev ? `${prev}\n- ${text}` : `- ${text}`);
    };

    return (
        <View className="flex-1 bg-background pt-12">
            <View className="flex-row items-center px-4 pb-4 border-b border-border">
                <Button variant="ghost" size="icon" onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </Button>
                <Text className="text-xl font-bold ml-2">Add New App</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
                    {/* Prerequisites */}
                    <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/50">
                        <CardContent className="p-4 gap-4">
                            <Text className="text-xl font-semibold leading-none tracking-tight text-amber-800 dark:text-amber-200">Prerequisites</Text>
                            {/* 1. Google Group */}
                            <View>
                                <Text className="font-semibold mb-2 text-foreground">1. Join Community</Text>
                                <View className="gap-3">
                                    <GoogleGroupWidget className="mb-0" />
                                    <TouchableOpacity
                                        onPress={() => {
                                            const { Linking } = require('react-native');
                                            Linking.openURL("https://t.me/developers_community_official/1");
                                        }}
                                        className="flex-row items-center justify-between bg-sky-500/10 border border-sky-500/20 p-3 rounded-xl"
                                    >
                                        <View className="flex-row items-center gap-3">
                                            <View className="bg-sky-500 p-2 rounded-full">
                                                <Icon as={SendIcon} className="text-white size-4" />
                                            </View>
                                            <View>
                                                <Text className="text-sky-800 dark:text-sky-200 font-bold text-sm">Join Telegram</Text>
                                                <Text className="text-sky-700/70 dark:text-sky-400/70 text-xs">Official Developers Community</Text>
                                            </View>
                                        </View>
                                        <Icon as={SendIcon} className="text-sky-500 size-4" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* 2. Add Email */}
                            <View>
                                <Text className="font-semibold mb-2 text-foreground">2. Play Console Setup</Text>
                                <Text className="text-sm text-muted-foreground mb-3">
                                    Add <Text className="font-bold text-foreground">developers-community-official@googlegroups.com</Text> to your app's Closed Testing track testers in Google Play Console.
                                </Text>

                                {/* Detailed Guide Link */}
                                <TouchableOpacity
                                    onPress={() => router.push('/playstore-guide')}
                                    className="flex-row items-center gap-2 bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl mb-3"
                                >
                                    <View className="bg-blue-500 p-2 rounded-full">
                                        <Icon as={CheckCircleIcon} className="text-white size-4" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-blue-800 dark:text-blue-200 font-bold text-sm">📖 View Step-by-Step Guide</Text>
                                        <Text className="text-blue-700/70 dark:text-blue-400/70 text-xs">See screenshots on how to add Google Group</Text>
                                    </View>
                                </TouchableOpacity>

                                <View className="flex-row items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                                    <Switch
                                        checked={hasAddedEmail}
                                        onCheckedChange={setHasAddedEmail}
                                    />
                                    <Text className="flex-1 text-sm font-medium">
                                        I confirm I have added the email to my testers list.
                                    </Text>
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
                                            <Text className="text-xs text-muted-foreground font-medium">Upload Icon <Text className="text-red-500">*</Text></Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <View>
                                <Label nativeID="appName" className="text-base font-semibold mb-1.5">App Name (max 30)</Label>
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
                                <Label nativeID="playUrl" className="text-base font-semibold mb-1.5">Google Play Link</Label>
                                <Input
                                    nativeID="playUrl"
                                    placeholder="https://play.google.com/..."
                                    value={playStoreUrl}
                                    onChangeText={setPlayStoreUrl}
                                    maxLength={200}
                                    className="bg-background/50 border-primary/20 focus:border-primary"
                                />
                                {packageName ? (
                                    <Text className="text-xs text-green-600 mt-1 font-medium">
                                        Detected Package: {packageName}
                                    </Text>
                                ) : (
                                    <Text className="text-xs text-muted-foreground mt-1">
                                        Paste ID link to auto-detect package name
                                    </Text>
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
                                <Input
                                    nativeID="testers"
                                    keyboardType="numeric"
                                    value={requiredTesters}
                                    onChangeText={setRequiredTesters}
                                    placeholder="12"
                                />
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

                    <Button
                        size="lg"
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                        className="mb-8"
                    >
                        {isSubmitting ? (
                            <View className="flex-row items-center gap-2">
                                <ActivityIndicator color="white" size="small" />
                                <Text>Uploading...</Text>
                            </View>
                        ) : (
                            <Text>Add App</Text>
                        )}
                    </Button>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
