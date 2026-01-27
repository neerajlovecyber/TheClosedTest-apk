
import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Image, Pressable, Share } from 'react-native';
import { toast } from '@/lib/sonner';
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
import { ArrowLeftIcon, UploadIcon, ImagePlusIcon, XIcon, CheckCircleIcon, SendIcon, CopyIcon, CheckIcon, ShareIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const GOOGLE_GROUP_EMAIL = 'developers-community-official@googlegroups.com';

function CopyableEmail() {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await Share.share({ message: GOOGLE_GROUP_EMAIL });
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.log('Share error:', error);
        }
    };

    return (
        <Pressable
            onPress={handleCopy}
            className="flex-row items-center justify-between p-3 rounded-xl bg-primary/10 active:bg-primary/20 mb-3"
        >
            <View className="flex-1 mr-3">
                <Text className="text-xs text-muted-foreground mb-1">Tap to share/copy email</Text>
                <Text className="text-xs font-mono font-semibold text-foreground" numberOfLines={1}>
                    {GOOGLE_GROUP_EMAIL}
                </Text>
            </View>
            <View className={`w-9 h-9 rounded-full items-center justify-center ${copied ? 'bg-green-500' : 'bg-primary'}`}>
                <Icon as={copied ? CheckIcon : ShareIcon} className="text-white size-4" />
            </View>
        </Pressable>
    );
}

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
            toast.error('Error', { description: 'Please upload an app icon' });
            return;
        }

        if (!title || !playStoreUrl || !instructions) {
            toast.error('Error', { description: 'Please fill in all required fields' });
            return;
        }

        if (!currentUser?.isGroupMember) {
            toast.info('Requirement', { description: 'You must join the Google Group first.' });
            return;
        }

        if (!hasAddedEmail) {
            toast.info('Requirement', { description: 'You must confirm you have added the group email to your testers list.' });
            return;
        }

        if (!packageName) {
            toast.error('Error', { description: 'Invalid Play Store link. Could not extract package name.' });
            return;
        }

        const testers = parseInt(requiredTesters);
        if (isNaN(testers) || testers < 0 || testers > 12) {
            toast.error('Error', { description: 'Please enter a number between 0 and 12 for required testers' });
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
                    toast.info("Warning", { description: "App created but icon upload failed: " + uploadError.message });
                    // Optionally delete app if critical
                }
            }

            // To properly call updateApp, I need to add `const updateApp = useMutation(api.apps.updateApp);` at component top.
            // I will return for now and fix imports in next step.


            // Invalidate caches so new app appears immediately in home and marketplace
            invalidateApps();

            toast.success('Success', { description: 'App added successfully!' });
            router.back();
        } catch (error: any) {
            console.error("Submit error:", error);
            toast.error('Error', { description: error.message || 'Failed to add app' });
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
                                <Text className="text-sm text-muted-foreground mb-2">
                                    Add the group email below to your app's Closed Testing track testers in Google Play Console.
                                </Text>
                                <CopyableEmail />

                                {/* Detailed Guide Link - PROMINENT */}
                                <TouchableOpacity
                                    onPress={() => router.push('/playstore-guide')}
                                    className="flex-row items-center gap-3 bg-blue-600 p-4 rounded-2xl mb-4"
                                    style={{ elevation: 4, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
                                    activeOpacity={0.8}
                                >
                                    <View className="bg-white/25 p-3 rounded-xl">
                                        <Icon as={CheckCircleIcon} className="text-white size-6" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-white font-bold text-base">📖 View Step-by-Step Guide</Text>
                                        <Text className="text-blue-100 text-sm mt-0.5">Tap here to see screenshots & instructions</Text>
                                    </View>
                                    <View className="bg-white/25 p-2 rounded-full">
                                        <Icon as={ArrowLeftIcon} className="text-white size-4 rotate-180" />
                                    </View>
                                </TouchableOpacity>

                                {/* Confirmation Checkbox - PROMINENT */}
                                <View className={`flex-row items-center gap-4 p-4 rounded-2xl border-2 ${hasAddedEmail ? 'bg-green-500/10 border-green-500' : 'bg-orange-500/10 border-orange-400 animate-pulse'}`}>
                                    <Switch
                                        checked={hasAddedEmail}
                                        onCheckedChange={setHasAddedEmail}
                                        className="scale-125"
                                    />
                                    <View className="flex-1">
                                        <Text className={`text-base font-bold ${hasAddedEmail ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
                                            {hasAddedEmail ? '✓ Confirmed!' : '⚠️ Required Confirmation'}
                                        </Text>
                                        <Text className="text-sm text-muted-foreground mt-0.5">
                                            I have added the group email to my testers list
                                        </Text>
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
