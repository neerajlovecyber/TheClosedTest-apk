import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, FlatList, Keyboard, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { UploadIcon, CheckCircleIcon, XCircleIcon, ClockIcon, InfoIcon, CameraIcon, SendIcon, MessageSquareIcon, UserIcon, FlaskConicalIcon, SmartphoneIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function MatchDashboardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const matchId = id as Id<"matches">;

    // Queries
    const matchDetails = useQuery(api.matches.getMatchDetails, { matchId });
    const proofs = useQuery(api.matches.getProofs, { matchId }) || [];
    const messages = useQuery(api.matches.getMessages, { matchId }) || [];

    // Mutations
    const generateUploadUrl = useMutation(api.files.generateUploadUrl);
    const uploadProofMutation = useMutation(api.matches.uploadProof);
    const reviewProofMutation = useMutation(api.matches.reviewProof);
    const sendMessageMutation = useMutation(api.matches.sendMessage);

    // Navigation State
    const [activeTab, setActiveTab] = useState<'testing' | 'myapp' | 'chat'>('testing');
    const flatListRef = useRef<FlatList>(null);
    const tabs: ('testing' | 'myapp' | 'chat')[] = ['testing', 'myapp', 'chat'];

    const [newMessage, setNewMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => {
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    // Sync FlatList with activeTab state when updated via Pill
    useEffect(() => {
        const targetIndex = tabs.indexOf(activeTab);
        // Only scroll if the index is valid and different from current visual position (we rely on user action mostly)
        // If the user swiped, onMomentumScrollEnd sets the tab. We shouldn't scroll again.
        // But if user clicked pill, we MUST scroll.
        // We can distinguish by storing the 'expected' index.
        // For simplicity: We always try to scroll to the active tab's index.
        // FlatList prevents glitchy loops if already there.
        flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    }, [activeTab]);


    if (!matchDetails) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text>Loading...</Text>
            </View>
        );
    }

    const { match, app, partner, day, isTester } = matchDetails;
    const currentDay = day > 14 ? 14 : day;

    const handleUpload = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled) {
                setIsUploading(true);
                const asset = result.assets[0];
                const postUrl = await generateUploadUrl();
                const response = await fetch(postUrl, {
                    method: "POST",
                    headers: { "Content-Type": asset.mimeType || "image/jpeg" },
                    body: await (await fetch(asset.uri)).blob(),
                });
                if (!response.ok) throw new Error("Upload failed");
                const { storageId } = await response.json();

                await uploadProofMutation({
                    matchId,
                    storageId,
                    day: currentDay,
                    type: "image",
                    comment: "Daily screenshot upload"
                });
                Alert.alert("Success", "Proof uploaded!");
            }
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        await sendMessageMutation({
            matchId,
            content: newMessage,
            type: "text"
        });
        setNewMessage('');
    };

    const handleReview = async (proofId: Id<"proofs">, status: "approved" | "rejected") => {
        await reviewProofMutation({ proofId, status });
    };

    // Component: Header (Minimal - No Back, No Icon)
    const Header = () => (
        <View className="mb-6 px-4 pt-4">
            <View className="flex-row items-center justify-between mb-4">
                <View>
                    <Text className="text-2xl font-bold">{app.title}</Text>
                    <Text className="text-sm text-muted-foreground">Day {currentDay} / 14</Text>
                </View>
                {/* Removed Back Button and User Icon as requested */}
            </View>
        </View>
    );

    const renderItem = ({ item }: { item: 'testing' | 'myapp' | 'chat' }) => {
        if (item === 'testing') {
            return (
                <ScrollView
                    className="flex-1"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    style={{ width: SCREEN_WIDTH }}
                >
                    <Header />
                    <View className="px-4">
                        <Text className="text-lg font-bold mb-2">Today's Task</Text>
                        <TouchableOpacity
                            onPress={handleUpload}
                            className="w-full aspect-video rounded-xl border-2 border-dashed border-border bg-card items-center justify-center mb-6"
                        >
                            {isUploading ? (
                                <Text className="text-muted-foreground">Uploading...</Text>
                            ) : (
                                <View className="items-center">
                                    <Icon as={CameraIcon} className="text-primary size-8 mb-2" />
                                    <Text className="font-medium">Upload Screenshot</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <Card className="bg-secondary/20 mb-6">
                            <CardContent className="p-4">
                                <Text className="font-bold mb-2">Instructions</Text>
                                <Text className="text-muted-foreground text-sm">{app.instructions}</Text>
                            </CardContent>
                        </Card>

                        <Text className="font-bold mb-4">Your Progress</Text>
                        {proofs.map((p, i) => (
                            <View key={i} className="flex-row items-center mb-3">
                                <View className={`w-2 h-2 rounded-full mr-3 ${p.status === 'approved' ? 'bg-green-500' : 'bg-orange-500'}`} />
                                <Text className="flex-1">Day {p.day}</Text>
                                <Text className="text-xs capitalize text-muted-foreground">{p.status}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            );
        }

        if (item === 'myapp') {
            return (
                <ScrollView
                    className="flex-1"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    style={{ width: SCREEN_WIDTH }}
                >
                    <Header />
                    <View className="px-4">
                        <Text className="text-lg font-bold mb-4">Partner's Progress</Text>
                        {proofs.length === 0 ? (
                            <View className="items-center py-10">
                                <Text className="text-muted-foreground">No proofs submitted yet.</Text>
                            </View>
                        ) : (
                            proofs.map((proof) => (
                                <Card key={proof._id} className="mb-4">
                                    <CardContent className="p-3">
                                        <View className="flex-row justify-between items-center mb-2">
                                            <Text className="font-bold">Day {proof.day}</Text>
                                            <Text className={`text-xs capitalize font-bold ${proof.status === 'approved' ? 'text-green-600' :
                                                proof.status === 'rejected' ? 'text-red-600' : 'text-orange-600'
                                                }`}>{proof.status}</Text>
                                        </View>
                                        {proof.url && (
                                            <Image source={{ uri: proof.url }} className="w-full h-40 rounded-lg bg-muted mb-3" resizeMode="cover" />
                                        )}
                                        {proof.status === 'pending' && (
                                            <View className="flex-row gap-2 mt-2">
                                                <TouchableOpacity onPress={() => handleReview(proof._id, 'approved')} className="flex-1 bg-green-100 p-2 rounded items-center mr-2">
                                                    <Text className="text-green-700 font-bold text-xs">Accept</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => handleReview(proof._id, 'rejected')} className="flex-1 bg-red-100 p-2 rounded items-center">
                                                    <Text className="text-red-700 font-bold text-xs">Reject</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </View>
                </ScrollView>
            );
        }

        if (item === 'chat') {
            return (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    className="flex-1"
                    style={{ width: SCREEN_WIDTH }}
                >
                    <FlatList
                        data={messages}
                        keyExtractor={(item) => item._id}
                        className="flex-1 px-4"
                        ListHeaderComponent={<Header />}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        renderItem={({ item }) => (
                            <View className={`mb-3 max-w-[80%] ${item.isMe ? 'self-end' : 'self-start'}`}>
                                <View className={`p-3 rounded-2xl ${item.isMe ? 'bg-primary rounded-tr-sm' : 'bg-secondary rounded-tl-sm'}`}>
                                    <Text className={item.isMe ? 'text-primary-foreground' : 'text-foreground'}>{item.content}</Text>
                                </View>
                                <Text className="text-[10px] text-muted-foreground mt-1 mx-1">
                                    {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        )}
                    />
                    <View className="p-3 border-t border-border flex-row items-center bg-background" style={{ marginBottom: isKeyboardVisible ? 0 : 80 }}>
                        <TextInput
                            className="flex-1 bg-secondary p-3 rounded-full mr-3 text-foreground"
                            placeholder="Type a message..."
                            placeholderTextColor="#9ca3af"
                            value={newMessage}
                            onChangeText={setNewMessage}
                        />
                        <TouchableOpacity onPress={handleSendMessage} className="bg-primary p-3 rounded-full">
                            <Icon as={SendIcon} className="text-primary-foreground size-5" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            );
        }
        return null;
    };


    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
            <View className="flex-1 relative">
                <FlatList
                    ref={flatListRef}
                    data={tabs}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    renderItem={renderItem}
                    keyExtractor={(item) => item}
                    onMomentumScrollEnd={(event) => {
                        const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                        const newTab = tabs[index];
                        if (newTab && newTab !== activeTab) {
                            setActiveTab(newTab);
                        }
                    }}
                />

                {/* --- Floating Navigation Pill --- */}
                {!isKeyboardVisible && (
                    <View className="absolute bottom-5 left-4 right-4 items-center">
                        <View className="flex-row bg-foreground/90 rounded-full shadow-lg p-1.5 px-2">
                            {tabs.map(tab => (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    className={`flex-row items-center px-4 py-2.5 rounded-full ${activeTab === tab ? 'bg-background' : 'bg-transparent'}`}
                                >
                                    <Icon
                                        as={tab === 'testing' ? FlaskConicalIcon : tab === 'myapp' ? SmartphoneIcon : MessageSquareIcon}
                                        className={`size-5 ${activeTab === tab ? 'text-foreground' : 'text-background'}`}
                                    />
                                    {activeTab === tab && <Text className="text-foreground font-bold ml-2 text-sm">
                                        {tab === 'testing' ? 'Testing' : tab === 'myapp' ? 'My App' : 'Chat'}
                                    </Text>}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}
