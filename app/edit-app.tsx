
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftIcon, UploadIcon, ImagePlusIcon, XIcon, CheckCircleIcon, Trash2Icon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Id } from '@/convex/_generated/dataModel';

export default function EditAppScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams();
    const appId = id as Id<"apps">;

    const app = useQuery(api.apps.getAppArgs, { appId });
    const updateApp = useMutation(api.apps.updateApp);
    const deleteApp = useMutation(api.apps.deleteApp);

    const [title, setTitle] = useState('');
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [packageName, setPackageName] = useState('');
    const [instructions, setInstructions] = useState('');
    const [requiredTesters, setRequiredTesters] = useState('12');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Processed image URI to display/upload
    const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);
    // Remote URL of existing image
    const [currentIconUrl, setCurrentIconUrl] = useState<string | null>(null);

    // Pre-fill form when app data is loaded
    useEffect(() => {
        if (app) {
            setTitle(app.title);
            setPlayStoreUrl(app.playStoreUrl || '');
            setPackageName(app.packageName);
            setInstructions(app.instructions || '');
            setRequiredTesters(String(app.requiredTesters));
            setCurrentIconUrl(app.iconUrl || null);
        }
    }, [app]);

    // Auto-extract package name
    React.useEffect(() => {
        const match = playStoreUrl.match(/id=([a-zA-Z0-9_.]+)/);
        if (match && match[1]) {
            setPackageName(match[1]);
        } else if (!app) {
            // Only clear if not editing existing valid package
            setPackageName('');
        }
    }, [playStoreUrl]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.canceled) {
            await optimizeImage(result.assets[0].uri);
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
            Alert.alert("Error", "Failed to process image.");
            setProcessedImageUri(uri);
        }
    };

    const handleSubmit = async () => {
        if (!title || !playStoreUrl || !instructions) {
            Alert.alert('Error', 'Please fill in all required fields');
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
            let iconUrl = currentIconUrl;

            // Upload new image if selected
            if (processedImageUri) {
                try {
                    const { uploadImageToR2 } = require('@/utils/image-uploader');
                    // Use deterministic filename: app-icons/<appId>.webp
                    iconUrl = await uploadImageToR2(processedImageUri, "app-icons", `${appId}.webp`);
                } catch (uploadError: any) {
                    Alert.alert("Error", "Icon upload failed: " + uploadError.message);
                    setIsSubmitting(false);
                    return;
                }
            }

            // Update App
            await updateApp({
                appId: appId,
                title,
                packageName,
                playStoreUrl,
                iconUrl: iconUrl || undefined,
                instructions,
                requiredTesters: testers,
            });

            Alert.alert('Success', 'App updated successfully!');
            router.back();
        } catch (error: any) {
            console.error("Submit error:", error);
            Alert.alert('Error', error.message || 'Failed to update app');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addInstruction = (text: string) => {
        setInstructions(prev => prev ? `${prev}\n- ${text}` : `- ${text}`);
    };

    if (!app) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-background pt-12">
            <Stack.Screen options={{ headerShown: false }} />
            <View className="flex-row items-center px-4 pb-4 border-b border-border">
                <Button variant="ghost" size="icon" onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </Button>
                <Text className="text-xl font-bold ml-2">Edit App</Text>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>App Details</CardTitle>
                        </CardHeader>
                        <CardContent className="gap-4">
                            <View className="mb-6 items-center">
                                <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
                                    <View className="relative">
                                        <Image
                                            source={{ uri: processedImageUri || currentIconUrl || 'https://github.com/shadcn.png' }}
                                            className="size-28 rounded-2xl border-2 border-primary/20 bg-muted"
                                        />
                                        <View className="absolute -top-2 -right-2 bg-background rounded-full p-1 border border-border shadow-sm">
                                            <Icon as={processedImageUri ? CheckCircleIcon : EditIcon} className="size-4 text-primary" />
                                        </View>
                                    </View>
                                    <Text className="text-xs text-center text-muted-foreground mt-2">Tap to change icon</Text>
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
                                {/* Package Name Display */}
                                {packageName ? (
                                    <Text className="text-xs text-green-600 mt-1 font-medium">
                                        Detected Package: {packageName}
                                    </Text>
                                ) : (
                                    <Text className="text-xs text-destructive mt-1">
                                        Invalid Play Store URL
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
                        className="mb-4 rounded-2xl shadow-sm"
                    >
                        {isSubmitting ? (
                            <View className="flex-row items-center gap-2">
                                <ActivityIndicator color="white" size="small" />
                                <Text className="text-white font-bold">Updating...</Text>
                            </View>
                        ) : (
                            <Text className="text-white font-bold text-lg">Save Changes</Text>
                        )}
                    </Button>

                    <Button
                        variant="destructive"
                        size="lg"
                        onPress={() => {
                            Alert.alert(
                                "Delete App",
                                "Are you sure? This will permanently remove your app and all associated test records. This cannot be undone.",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                        text: "Delete",
                                        style: "destructive",
                                        onPress: async () => {
                                            try {
                                                setIsSubmitting(true);
                                                // Delete image from R2 first
                                                try {
                                                    const { deleteImageFromR2 } = require('@/utils/image-uploader');
                                                    await deleteImageFromR2(`app-icons/${appId}.webp`);
                                                } catch (imgError) {
                                                    console.warn("Failed to delete image", imgError);
                                                }

                                                await deleteApp({ appId });
                                                router.replace("/(tabs)/" as any);
                                            } catch (err: any) {
                                                Alert.alert("Error", err.message);
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }
                                    }
                                ]
                            );
                        }}
                        disabled={isSubmitting}
                        className="mb-12 rounded-2xl shadow-sm"
                    >
                        <View className="flex-row items-center gap-2">
                            <Icon as={Trash2Icon} className="size-5 text-white" />
                            <Text className="text-white font-bold text-lg">Delete App</Text>
                        </View>
                    </Button>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// Helper to avoid Icon.as undefined error if EditIcon is used in inline JSX
import { EditIcon } from 'lucide-react-native';
