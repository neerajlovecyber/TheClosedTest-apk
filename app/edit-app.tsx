import React, { useState, useEffect } from 'react';
import { View, Platform, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/lib/sonner';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftIcon, UploadIcon, Trash2Icon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAppDetails, useUpdateApp, usePresignedUploadUrl } from '@/lib/api-hooks';

export default function EditAppScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const appId = id as string;

    const { data: app, isLoading } = useAppDetails(appId);
    const updateAppMutation = useUpdateApp();
    const getPresignedUrlMutation = usePresignedUploadUrl();

    const [title, setTitle] = useState('');
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [packageName, setPackageName] = useState('');
    const [instructions, setInstructions] = useState('');
    const [requiredTesters, setRequiredTesters] = useState('12');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [processedImageUri, setProcessedImageUri] = useState<string | null>(null);
    const [currentIconUrl, setCurrentIconUrl] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    React.useEffect(() => {
        const match = playStoreUrl.match(/id=([a-zA-Z0-9_.]+)/);
        if (match && match[1]) {
            setPackageName(match[1]);
        }
    }, [playStoreUrl]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.canceled) {
            try {
                const manipulated = await manipulateAsync(
                    result.assets[0].uri,
                    [{ resize: { width: 128, height: 128 } }],
                    { compress: 0.8, format: SaveFormat.WEBP }
                );
                setProcessedImageUri(manipulated.uri);
            } catch {
                setProcessedImageUri(result.assets[0].uri);
            }
        }
    };

    const handleSubmit = async () => {
        if (!title || !playStoreUrl || !instructions) {
            toast.error('Error', { description: 'Please fill in all required fields' });
            return;
        }

        setIsSubmitting(true);
        try {
            let iconUrl = currentIconUrl || undefined;

            if (processedImageUri) {
                const { uploadUrl, publicUrl } = await getPresignedUrlMutation.mutateAsync({
                    filename: `app_${appId}_icon.webp`,
                    contentType: 'image/webp',
                    folder: 'icons',
                });

                const FileSystem = require('expo-file-system/legacy');
                const base64 = await FileSystem.readAsStringAsync(processedImageUri, {
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
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    xhr.send(bytes.buffer);
                });

                iconUrl = publicUrl;
            }

            await updateAppMutation.mutateAsync({
                id: appId,
                title,
                playStoreUrl,
                iconUrl,
                instructions,
            });

            toast.success('Success', { description: 'App updated successfully!' });
            router.back();
        } catch (error: any) {
            console.error('Submit error:', error);
            toast.error('Error', { description: error.message || 'Failed to update app' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        setIsSubmitting(true);
        try {
            await updateAppMutation.mutateAsync({
                id: appId,
                status: 'archived',
            });
            toast.success('Deleted', { description: 'App archived successfully.' });
            router.replace('/(tabs)/' as any);
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to archive app' });
        } finally {
            setIsSubmitting(false);
            setShowDeleteConfirm(false);
        }
    };

    if (isLoading || !app) {
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

            <KeyboardAwareScrollView
                bottomOffset={Platform.OS === 'ios' ? 100 : 80}
                className="flex-1 p-4"
                contentContainerStyle={{ paddingBottom: 40 }}
            >
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
                                        <Icon as={UploadIcon} className="size-4 text-primary" />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>

                        <View>
                            <Label nativeID="appName" className="text-base font-semibold mb-1.5">App Name</Label>
                            <Input
                                nativeID="appName"
                                value={title}
                                onChangeText={setTitle}
                                maxLength={30}
                            />
                        </View>

                        <View>
                            <Label nativeID="playUrl" className="text-base font-semibold mb-1.5">Google Play Link</Label>
                            <Input
                                nativeID="playUrl"
                                value={playStoreUrl}
                                onChangeText={setPlayStoreUrl}
                            />
                        </View>
                    </CardContent>
                </Card>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Testing Instructions</CardTitle>
                    </CardHeader>
                    <CardContent className="gap-4">
                        <Textarea
                            nativeID="instructions"
                            value={instructions}
                            onChangeText={setInstructions}
                            maxLength={250}
                            className="h-32"
                        />
                    </CardContent>
                </Card>

                <View className="gap-3 mb-8">
                    <Button
                        size="lg"
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="white" size="small" />
                        ) : (
                            <Text>Save Changes</Text>
                        )}
                    </Button>

                    <Button
                        size="lg"
                        variant="destructive"
                        onPress={() => setShowDeleteConfirm(true)}
                        disabled={isSubmitting}
                    >
                        <Icon as={Trash2Icon} className="size-4 text-white mr-2" />
                        <Text className="text-white font-bold">Delete App</Text>
                    </Button>
                </View>
            </KeyboardAwareScrollView>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete App?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this app? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowDeleteConfirm(false)}>
                            <Text>Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction onPress={handleDelete} className="bg-destructive">
                            <Text className="text-white font-bold">Delete</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </View>
    );
}
