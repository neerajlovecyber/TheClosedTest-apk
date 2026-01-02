
import React, { useState } from 'react';
import { View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftIcon, UploadIcon, ImagePlusIcon, XIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { TouchableOpacity, ActivityIndicator } from 'react-native';

export default function AddAppScreen() {
    const router = useRouter();

    const createApp = useMutation(api.apps.createApp);

    const [title, setTitle] = useState('');
    const [playStoreUrl, setPlayStoreUrl] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [instructions, setInstructions] = useState('');
    const [requiredTesters, setRequiredTesters] = useState('12');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            setSelectedImage(result.assets[0].uri);
        }
    };

    const handleSubmit = async () => {
        if (!title || !playStoreUrl || !instructions) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        const testers = parseInt(requiredTesters);
        if (isNaN(testers) || testers < 0 || testers > 20) {
            Alert.alert('Error', 'Please enter a number between 0 and 20 for required testers');
            return;
        }

        setIsSubmitting(true);
        try {
            if (selectedImage) {
                console.log("Mock uploading image:", selectedImage);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate upload
            }

            await createApp({
                title,
                packageName: "com.placeholder.app", // Dummy value since removed from UI
                playStoreUrl,
                iconUrl: selectedImage || 'https://github.com/shadcn.png', // Use local URI or default for mock
                instructions,
                requiredTesters: testers,
            });



            Alert.alert('Success', 'App added successfully!');
            router.back();
        } catch (error: any) {
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
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>App Details</CardTitle>
                        </CardHeader>
                        <CardContent className="gap-4">
                            <View className="mb-6 items-center">
                                <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
                                    {selectedImage ? (
                                        <View className="relative">
                                            <Image source={{ uri: selectedImage }} className="size-28 rounded-2xl border-2 border-primary/20" />
                                            <View className="absolute -top-2 -right-2 bg-background rounded-full p-1 border border-border shadow-sm">
                                                <Icon as={UploadIcon} className="size-4 text-primary" />
                                            </View>
                                        </View>
                                    ) : (
                                        <View className="size-28 rounded-2xl bg-muted/50 border-2 border-dashed border-muted-foreground/30 items-center justify-center gap-2">
                                            <Icon as={ImagePlusIcon} className="size-8 text-muted-foreground" />
                                            <Text className="text-xs text-muted-foreground font-medium">Upload Icon</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <View>
                                <Label nativeID="appName" className="text-base font-semibold mb-1.5">App Name</Label>
                                <Input
                                    nativeID="appName"
                                    placeholder="e.g. Flappy Bird 2"
                                    value={title}
                                    onChangeText={setTitle}
                                    className="bg-background/50 border-primary/20 focus:border-primary"
                                />
                            </View>



                            <View>
                                <Label nativeID="playUrl" className="text-base font-semibold mb-1.5">Google Play Link</Label>
                                <Input
                                    nativeID="playUrl"
                                    placeholder="https://play.google.com/..."
                                    value={playStoreUrl}
                                    onChangeText={setPlayStoreUrl}
                                    className="bg-background/50 border-primary/20 focus:border-primary"
                                />
                            </View>
                        </CardContent>
                    </Card>

                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Testing Requirements</CardTitle>
                        </CardHeader>
                        <CardContent className="gap-4">
                            <View>
                                <Label nativeID="testers">Testers Needed (max 12 after update) *</Label>
                                <Input
                                    nativeID="testers"
                                    keyboardType="numeric"
                                    value={requiredTesters}
                                    onChangeText={setRequiredTesters}
                                    placeholder="12"
                                />
                            </View>

                            <View>
                                <Label nativeID="instructions">Instructions for Testers *</Label>
                                <Textarea
                                    nativeID="instructions"
                                    placeholder="Explain how to test your app..."
                                    value={instructions}
                                    onChangeText={setInstructions}
                                    className="h-32"
                                />
                                <View className="flex-row flex-wrap gap-2 mt-3">
                                    <Button variant="outline" size="sm" onPress={() => addInstruction("Keep installed for 14 days")}>
                                        <Text>+ 14 Days</Text>
                                    </Button>
                                    <Button variant="outline" size="sm" onPress={() => addInstruction("Open daily")}>
                                        <Text>+ Open Daily</Text>
                                    </Button>
                                    <Button variant="outline" size="sm" onPress={() => addInstruction("Test login flow")}>
                                        <Text>+ Test Login</Text>
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
                        <Text>{isSubmitting ? 'Submitting...' : 'Add App'}</Text>
                    </Button>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
