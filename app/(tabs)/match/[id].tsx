import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image as RNImage, TouchableOpacity, TextInput, Platform, FlatList, Keyboard, useWindowDimensions, Pressable, Alert, Modal, KeyboardAvoidingView as RNKeyboardAvoidingView, Linking } from 'react-native';
import { Image } from 'expo-image';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { useInvalidateQueries } from '@/hooks/useInvalidateQueries';
import { Id } from '@/convex/_generated/dataModel';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SendIcon, MessageSquareIcon, CalendarCheckIcon, BarChart3Icon, InfoIcon, UploadIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, XCircleIcon, CheckCircle2Icon, ExternalLinkIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';
import { ProofUploader } from '@/components/ProofUploader';
import { ProofReviewer } from '@/components/ProofReviewer';
import { ProgressGrid } from '@/components/ProgressGrid';
import { RejectionReasonModal } from '@/components/RejectionReasonModal';
import { MatchChat } from '@/components/MatchChat';
const isWeb = Platform.OS === 'web';

export default function MatchDashboardScreen() {
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
    const router = useRouter();
    const matchId = id as Id<"matches">;

    // Queries (with caching for instant loading)
    const { data: matchDetails } = useCachedConvexQuery(['matchDetails', matchId], api.matches.getMatchDetails, { matchId });
    const { data: todayProof } = useCachedConvexQuery(['todayProof', matchId], api.matches.getTodayProof, { matchId });
    const { data: partnerProof } = useCachedConvexQuery(['partnerProof', matchId], api.matches.getPartnerTodayProof, { matchId });
    const { data: progressData } = useCachedConvexQuery(['progressData', matchId], api.matches.getProgressData, { matchId });

    // Mutations
    const cancelMatchMutation = useMutation(api.matches.cancelMatch);

    // Navigation State
    const [chatVisible, setChatVisible] = useState(false);

    const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
    const [proofToReject, setProofToReject] = useState<Id<"proofs"> | null>(null);
    const [proofToRejectUrls, setProofToRejectUrls] = useState<string[]>([]);
    const [instructionsExpanded, setInstructionsExpanded] = useState(false);




    if (!matchDetails) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text>Loading...</Text>
            </View>
        );
    }

    const { match, app, partner, day } = matchDetails;
    const currentDay = day > 14 ? 14 : day;

    // Calculate unread status
    const isUser1 = partner ? match.user1Id !== partner._id : true;
    const lastRead = isUser1 ? (match.lastRead1 || 0) : (match.lastRead2 || 0);
    const hasUnread = match.lastActivity > lastRead;

    const handleRejectPress = (proofId: Id<"proofs">) => {
        setProofToReject(proofId);
        // If the proofId matches the partnerProof we loaded, use its URLs
        // Note: partnerProof is the proof object for TODAY.
        // If we reject a proof, it's usually the one displayed in ProofReviewer, which is `partnerProof`.
        if (partnerProof && partnerProof.status !== 'not_uploaded' && partnerProof._id === proofId) {
            setProofToRejectUrls(partnerProof.urls || []);
        } else {
            setProofToRejectUrls([]);
        }
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

    const handleLeaveMatch = () => {
        Alert.alert(
            "Stop Testing?",
            "Are you sure you want to cancel this match? This action cannot be undone and you will lose your progress.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Stop Testing",
                    style: "destructive",
                    onPress: async () => {
                        if (!matchId) return;
                        try {
                            await cancelMatchMutation({ matchId });
                            await cancelMatchMutation({ matchId });
                            router.replace("/(tabs)/" as any);
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Error", "Failed to cancel match");
                        }
                    }
                }
            ]
        );
    };

    const handleOpenApp = async () => {
        if (!app?.packageName) {
            Alert.alert("Error", "Package name not available");
            return;
        }

        const packageName = app.packageName;
        // Construct fallback URLs
        const marketUrl = `market://details?id=${packageName}`;
        const webUrl = app.playStoreUrl || `https://play.google.com/store/apps/details?id=${packageName}`;

        const openPlayStore = () => {
            Linking.canOpenURL(marketUrl).then(supported => {
                if (supported) {
                    Linking.openURL(marketUrl);
                } else {
                    Linking.openURL(webUrl);
                }
            }).catch(() => {
                Linking.openURL(webUrl);
            });
        };

        if (Platform.OS === 'android') {
            try {
                // Use openApplication for direct launch by package name
                // This avoids the "Complete action using" chooser dialog
                // @ts-ignore - openApplication is available in expo-intent-launcher ~13.0.0
                await IntentLauncher.openApplication(packageName);
            } catch (error: any) {
                console.log("App launch failed:", error);
                // Only open Play Store if launch fails (e.g. app not installed)
                openPlayStore();
            }
        } else {
            // iOS or Web: Just open the store/web link
            openPlayStore();
        }
    };

    // Unified Overview Content
    const renderOverviewContent = () => {
        // We use progressData for the summary card and timeline
        const summary = progressData?.summary;
        const days = progressData?.days || [];

        return (
            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: isWeb ? 40 : 60 }}
                style={!isWeb ? { width: SCREEN_WIDTH } : undefined}
            >
                {/* Header Section */}
                <View className="px-4 pt-4 pb-2">
                    <View className="flex-row items-center mb-4">
                        <Image
                            source={{ uri: app?.iconUrl }}
                            style={{ width: 64, height: 64, borderRadius: 16 }}
                            contentFit="cover"
                            transition={200}
                            className="bg-muted"
                        />
                        <View className="ml-4 flex-1">
                            <Text className="text-2xl font-bold">{app?.title || 'Testing'}</Text>
                            <Text className="text-sm text-muted-foreground" numberOfLines={1}>{app?.packageName}</Text>
                        </View>
                    </View>
                    <View className="flex-row items-center justify-between">
                        <Text className="text-sm text-muted-foreground">Day {currentDay} of 14</Text>
                        <View className="bg-primary/10 px-2 py-1 rounded-full">
                            <Text className="text-xs font-bold text-primary">{Math.round((currentDay / 14) * 100)}% Complete</Text>
                        </View>
                    </View>

                    {/* Open App Button */}
                    <TouchableOpacity
                        onPress={handleOpenApp}
                        className="flex-row items-center justify-center bg-primary mt-4 p-3 rounded-xl"
                    >
                        <Icon as={ExternalLinkIcon} className="text-primary-foreground size-5 mr-2" />
                        <Text className="text-primary-foreground font-bold text-base">Open {app?.title || 'App'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Progress Grid with Integrated Score Card */}
                {summary && (
                    <View className="mb-6 mt-4">
                        <Text className="text-sm font-bold px-4 mb-3 uppercase tracking-wider text-muted-foreground">14-Day Progress & Status</Text>
                        <ProgressGrid days={days} currentDay={currentDay} summary={summary} />
                    </View>
                )}

                {/* Today's Tasks */}
                <View className="px-4">
                    <Text className="text-sm font-bold mb-3 uppercase tracking-wider text-muted-foreground">Today's Tasks</Text>

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

                    <View className="h-px bg-border my-3" />

                    <SectionTitle icon={EyeIcon} title="Review Partner's Proof" />
                    <ProofReviewer matchId={matchId} partnerProof={partnerProof} onReject={handleRejectPress} />
                </View>

                {/* Leave Match Button */}
                <View className="px-4 mt-8">
                    <TouchableOpacity
                        onPress={handleLeaveMatch}
                        className="flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/50 w-full mb-8"
                    >
                        <Icon as={XCircleIcon} className="text-red-500 size-5 mr-2" />
                        <Text className="text-red-600 dark:text-red-400 font-medium">Stop Testing with {partner?.name?.split(' ')[0] || "Partner"}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    };


    // Mobile Render Item for FlatList
    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right']}>
            {/* Overview Content */}
            {renderOverviewContent()}

            {/* Chat Floating Button */}
            <View className="absolute bottom-6 right-6 z-50">
                <TouchableOpacity
                    onPress={() => setChatVisible(true)}
                    className="w-14 h-14 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/30 p-0"
                    activeOpacity={0.8}
                >
                    <Icon as={MessageSquareIcon} className="text-primary-foreground size-6" />
                </TouchableOpacity>

                {hasUnread && (
                    <View className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-background items-center justify-center">
                        <View className="w-2 h-2 bg-white rounded-full" />
                    </View>
                )}
            </View>

            <MatchChat
                visible={chatVisible}
                onClose={() => setChatVisible(false)}
                matchId={matchId}
                partnerName={partner?.name || "Partner"}
            />

            <RejectionReasonModal
                visible={rejectionModalVisible}
                proofId={proofToReject}
                onClose={() => { setRejectionModalVisible(false); setProofToReject(null); }}
            />
        </SafeAreaView>
    );
}
