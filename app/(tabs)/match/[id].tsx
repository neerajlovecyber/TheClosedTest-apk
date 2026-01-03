import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image, TouchableOpacity, TextInput, Platform, FlatList, Keyboard, useWindowDimensions, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SendIcon, MessageSquareIcon, CalendarCheckIcon, BarChart3Icon, InfoIcon, UploadIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProofUploader } from '@/components/ProofUploader';
import { ProofReviewer } from '@/components/ProofReviewer';
import { ProgressGrid } from '@/components/ProgressGrid';
import { RejectionReasonModal } from '@/components/RejectionReasonModal';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import Chat from '@codsod/react-native-chat';

const isWeb = Platform.OS === 'web';

export default function MatchDashboardScreen() {
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
    const router = useRouter();
    const matchId = id as Id<"matches">;

    // Queries
    const matchDetails = useQuery(api.matches.getMatchDetails, { matchId });
    const todayProof = useQuery(api.matches.getTodayProof, { matchId });
    const partnerProof = useQuery(api.matches.getPartnerTodayProof, { matchId });
    const progressData = useQuery(api.matches.getProgressData, { matchId });
    const messages = useQuery(api.matches.getMessages, { matchId }) || [];

    // Mutations
    const sendMessageMutation = useMutation(api.matches.sendMessage);

    // Navigation State - Initialize from URL parameter
    const [activeTab, setActiveTab] = useState<'today' | 'progress' | 'chat'>(
        (tab as 'today' | 'progress' | 'chat') || 'today'
    );
    const flatListRef = useRef<FlatList>(null);
    const tabs: ('today' | 'progress' | 'chat')[] = ['today', 'progress', 'chat'];

    const [newMessage, setNewMessage] = useState('');
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
    const [proofToReject, setProofToReject] = useState<Id<"proofs"> | null>(null);
    const [instructionsExpanded, setInstructionsExpanded] = useState(false);

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
        return () => {
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    // Track if tab change was from user tap (not swipe)
    const isUserTabPress = useRef(false);

    // Sync FlatList with tab only when user taps tab button
    useEffect(() => {
        if (!isWeb && isUserTabPress.current) {
            const targetIndex = tabs.indexOf(activeTab);
            flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true });
            isUserTabPress.current = false;
        }
    }, [activeTab]);

    // Handle initial tab from URL parameter (for deep linking)
    useEffect(() => {
        if (!isWeb && tab && flatListRef.current) {
            const targetIndex = tabs.indexOf(tab as 'today' | 'progress' | 'chat');
            if (targetIndex !== -1) {
                // Small delay to ensure FlatList is ready
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
                }, 100);
            }
        }
    }, [tab]);

    if (!matchDetails) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text>Loading...</Text>
            </View>
        );
    }

    const { match, app, partner, day } = matchDetails;
    const currentDay = day > 14 ? 14 : day;

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        await sendMessageMutation({
            matchId,
            content: newMessage,
            type: "text"
        });
        setNewMessage('');
    };

    const handleRejectPress = (proofId: Id<"proofs">) => {
        setProofToReject(proofId);
        setRejectionModalVisible(true);
    };

    // Header Component
    const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
        <View className="mb-4 px-4 pt-4">
            <Text className="text-2xl font-bold">{title}</Text>
            {subtitle && <Text className="text-sm text-muted-foreground">{subtitle}</Text>}
        </View>
    );

    // Section Title
    const SectionTitle = ({ icon: IconComponent, title }: { icon: any; title: string }) => (
        <View className="flex-row items-center mb-3 mt-4">
            <Icon as={IconComponent} className="text-primary size-5 mr-2" />
            <Text className="text-lg font-bold">{title}</Text>
        </View>
    );

    // Tab Button
    const TabButton = ({ tab, label, icon: IconComponent }: { tab: typeof activeTab; label: string; icon: any }) => (
        <TouchableOpacity
            onPress={() => {
                isUserTabPress.current = true;
                setActiveTab(tab);
            }}
            className={`flex-1 flex-row items-center justify-center py-2 rounded-lg ${activeTab === tab ? 'bg-white dark:bg-black shadow-sm' : ''}`}
        >
            <Icon as={IconComponent} className={`size-4 mr-2 ${activeTab === tab ? 'text-foreground' : 'text-muted-foreground'}`} />
            <Text className={`font-semibold text-sm ${activeTab === tab ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</Text>
        </TouchableOpacity>
    );

    // Status color helper
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'bg-green-500';
            case 'pending': return 'bg-orange-500';
            case 'rejected': return 'bg-red-500';
            case 'missed': return 'bg-gray-400';
            default: return 'bg-gray-200';
        }
    };

    // Shared Tab Content
    const renderTodayContent = () => (
        <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: isWeb ? 40 : 120 }}
            style={!isWeb ? { width: SCREEN_WIDTH } : undefined}
        >
            <Header title={app?.title || 'Testing App'} subtitle={`Day ${currentDay} of 14`} />
            <View className="px-4">
                {/* Collapsible Instructions */}
                <Pressable
                    onPress={() => setInstructionsExpanded(!instructionsExpanded)}
                    className="bg-secondary/30 rounded-xl p-3 mb-4 flex-row items-center justify-between"
                >
                    <View className="flex-row items-center flex-1">
                        <Icon as={InfoIcon} className="text-primary size-4 mr-2" />
                        <Text className="font-medium text-sm">Testing Instructions</Text>
                    </View>
                    <Icon as={instructionsExpanded ? ChevronUpIcon : ChevronDownIcon} className="text-muted-foreground size-5" />
                </Pressable>
                {instructionsExpanded && (
                    <Card className="bg-secondary/10 mb-4 -mt-2">
                        <CardContent className="p-3">
                            <Text className="text-muted-foreground text-sm">{app?.instructions || 'Follow the testing instructions'}</Text>
                        </CardContent>
                    </Card>
                )}

                <SectionTitle icon={UploadIcon} title="Your Daily Proof" />
                <ProofUploader matchId={matchId} currentDay={currentDay} todayProof={todayProof} />

                <View className="h-px bg-border my-6" />

                <SectionTitle icon={EyeIcon} title="Review Partner's Proof" />
                <ProofReviewer matchId={matchId} partnerProof={partnerProof} onReject={handleRejectPress} />
            </View>
        </ScrollView>
    );

    const renderProgressContent = () => (
        <View style={!isWeb ? { width: SCREEN_WIDTH } : undefined} className="flex-1">
            <Header title="Testing Progress" subtitle="14-day overview" />
            <View className="px-4 flex-1">
                {progressData ? (
                    <ProgressGrid
                        days={progressData.days}
                        currentDay={progressData.currentDay}
                        summary={progressData.summary}
                        partnerName={progressData.partnerName}
                        myAppName={progressData.myAppName}
                        partnerAppName={progressData.partnerAppName}
                    />
                ) : (
                    <View className="items-center justify-center py-10">
                        <Text className="text-muted-foreground">Loading progress...</Text>
                    </View>
                )}
            </View>
        </View>
    );

    const renderChatContent = () => {
        // Map Convex messages to expected format (newest first)
        const chatMessages = messages.map((msg) => ({
            _id: msg._id as unknown as number, // Cast to satisfy strict number type in library definition, assuming runtime allows string
            text: msg.content,
            createdAt: new Date(msg.sentAt),
            user: {
                _id: msg.isMe ? 1 : 2,
                name: msg.senderName || (msg.isMe ? "Me" : "Partner"),
                avatar: msg.senderAvatar,
            },
        })).reverse();

        const onSendMessage = (text: any) => {
            // The library passes the text content of the message
            const content = typeof text === 'string' ? text : text?.text || "";
            if (content) {
                sendMessageMutation({
                    matchId,
                    content: content,
                    type: "text"
                });
            }
        };

        return (
            <View style={!isWeb ? { width: SCREEN_WIDTH } : undefined} className="flex-1 bg-background">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 125 : 105}
                >
                    <View style={{ flex: 1 }}>
                        <Chat
                            messages={chatMessages}
                            setMessages={onSendMessage}
                            user={{
                                _id: 1,
                                name: "Me",
                            }}
                            themeColor="#000000"
                            themeTextColor="#ffffff"
                            inputBorderColor="#e5e7eb"
                            backgroundColor="#ffffff"
                            inputBackgroundColor="#f3f4f6"
                            placeholder="Type a message..."
                            showSenderAvatar={false}
                            showReceiverAvatar={false}
                        />
                    </View>
                </KeyboardAvoidingView>
            </View>
        );
    };

    // Mobile Render Item for FlatList
    const renderMobileItem = ({ item }: { item: typeof activeTab }) => {
        if (item === 'today') return renderTodayContent();
        if (item === 'progress') return renderProgressContent();
        if (item === 'chat') return renderChatContent();
        return null;
    };

    // WEB LAYOUT
    if (isWeb) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                {/* Tab Bar - Clean fixed tabs at top */}
                <View className="flex-row mx-4 my-3 p-1 bg-secondary/30 rounded-xl">
                    <TabButton tab="today" label="Today" icon={CalendarCheckIcon} />
                    <TabButton tab="progress" label="Progress" icon={BarChart3Icon} />
                    <TabButton tab="chat" label="Chat" icon={MessageSquareIcon} />
                </View>

                {/* Content */}
                {activeTab === 'today' && renderTodayContent()}
                {activeTab === 'progress' && renderProgressContent()}
                {activeTab === 'chat' && renderChatContent()}

                <RejectionReasonModal
                    visible={rejectionModalVisible}
                    proofId={proofToReject}
                    onClose={() => { setRejectionModalVisible(false); setProofToReject(null); }}
                />
            </SafeAreaView>
        );
    }

    // MOBILE LAYOUT - Tabs at top + swipe to switch
    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right']}>
            {/* Tab Bar - Clean fixed tabs at top */}
            <View className="flex-row mx-4 my-3 p-1 bg-gray-200/80 dark:bg-gray-800 rounded-xl">
                <TabButton tab="today" label="Today" icon={CalendarCheckIcon} />
                <TabButton tab="progress" label="Progress" icon={BarChart3Icon} />
                <TabButton tab="chat" label="Chat" icon={MessageSquareIcon} />
            </View>

            {/* Swipeable Content */}
            {/* Swipeable Content */}
            <FlatList
                ref={flatListRef}
                data={tabs}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                renderItem={renderMobileItem}
                keyExtractor={(item) => item}
                getItemLayout={(data, index) => ({
                    length: SCREEN_WIDTH,
                    offset: SCREEN_WIDTH * index,
                    index,
                })}
                initialScrollIndex={tabs.indexOf(activeTab)}
                onScrollToIndexFailed={(info) => {
                    const wait = new Promise(resolve => setTimeout(resolve, 500));
                    wait.then(() => {
                        flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
                    });
                }}
                onMomentumScrollEnd={(event) => {
                    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                    const newTab = tabs[index];
                    if (newTab && newTab !== activeTab) {
                        setActiveTab(newTab);
                    }
                }}
            />

            <RejectionReasonModal
                visible={rejectionModalVisible}
                proofId={proofToReject}
                onClose={() => { setRejectionModalVisible(false); setProofToReject(null); }}
            />
        </SafeAreaView>
    );
}
