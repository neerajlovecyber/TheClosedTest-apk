import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image, TouchableOpacity, TextInput, Platform, FlatList, Keyboard, useWindowDimensions, Pressable, Alert, Modal, KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { SendIcon, MessageSquareIcon, CalendarCheckIcon, BarChart3Icon, InfoIcon, UploadIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, XCircleIcon, CheckCircle2Icon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

    // Queries
    const matchDetails = useQuery(api.matches.getMatchDetails, { matchId });
    const todayProof = useQuery(api.matches.getTodayProof, { matchId });
    const partnerProof = useQuery(api.matches.getPartnerTodayProof, { matchId });
    const progressData = useQuery(api.matches.getProgressData, { matchId });

    // Mutations
    const cancelMatchMutation = useMutation(api.matches.cancelMatch);

    // Navigation State
    const [chatVisible, setChatVisible] = useState(false);

    const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
    const [proofToReject, setProofToReject] = useState<Id<"proofs"> | null>(null);
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



    // Timeline Item
    const renderTimelineItem = ({ item }: { item: any }) => {
        const isCurrent = item.day === currentDay;
        const myStatus = item.myStatus;

        let cardBg = "bg-secondary/30";
        let borderColor = "border-transparent";
        let textColor = "text-muted-foreground";

        if (myStatus === 'approved') {
            cardBg = "bg-green-100 dark:bg-green-900/40";
            borderColor = "border-green-200 dark:border-green-800";
            textColor = "text-green-700 dark:text-green-400";
        } else if (myStatus === 'rejected') {
            cardBg = "bg-red-100 dark:bg-red-900/40";
            borderColor = "border-red-200 dark:border-red-800";
            textColor = "text-red-700 dark:text-red-400";
        } else if (isCurrent) {
            cardBg = "bg-primary/10";
            borderColor = "border-primary";
            textColor = "text-primary";
        }

        return (
            <View className="mr-3 items-center">
                <View className={`w-14 h-20 rounded-2xl items-center justify-center border ${cardBg} ${borderColor} ${isCurrent ? 'border-2' : 'border'}`}>
                    <Text className={`text-xs font-medium mb-1 ${textColor}`}>Day</Text>
                    <Text className={`text-xl font-bold ${textColor}`}>{item.day}</Text>

                    <View className="mt-1 h-4 items-center justify-center">
                        {myStatus === 'approved' && <Icon as={CheckCircle2Icon} className="text-green-600 dark:text-green-400 size-4" />}
                        {myStatus === 'rejected' && <Icon as={XCircleIcon} className="text-red-600 dark:text-red-400 size-4" />}
                        {myStatus === 'pending' && <View className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-primary' : 'bg-orange-400'}`} />}
                    </View>
                </View>
            </View>
        );
    };

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
                            router.replace("/(tabs)/");
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Error", "Failed to cancel match");
                        }
                    }
                }
            ]
        );
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
                contentContainerStyle={{ paddingBottom: isWeb ? 40 : 120 }}
                style={!isWeb ? { width: SCREEN_WIDTH } : undefined}
            >
                {/* Header Section */}
                <View className="px-4 pt-4 pb-2">
                    <Text className="text-2xl font-bold mb-1">{app?.title || 'Testing'}</Text>
                    <View className="flex-row items-center justify-between">
                        <Text className="text-sm text-muted-foreground">Day {currentDay} of 14</Text>
                        <View className="bg-primary/10 px-2 py-1 rounded-full">
                            <Text className="text-xs font-bold text-primary">{Math.round((match.day || 1) / 14 * 100)}% Complete</Text>
                        </View>
                    </View>
                </View>

                {/* Unified Score Card */}
                {summary && (
                    <View className="px-4 mb-6">
                        <Card className="bg-secondary/10 border-border">
                            <CardContent className="p-5 flex-row justify-between items-center">
                                {/* My Stats */}
                                <View className="flex-1 items-center">
                                    <View className="flex-row items-center mb-1">
                                        <Icon as={TrophyIcon} className="text-primary size-4 mr-1.5" />
                                        <Text className="font-bold text-base text-primary">You</Text>
                                    </View>
                                    <Text className="text-3xl font-black text-foreground">
                                        {summary.myApproved}<Text className="text-sm text-muted-foreground font-medium">/{summary.totalDays}</Text>
                                    </Text>
                                    <Text className="text-xs text-muted-foreground -mt-1 mb-1">Days Approved</Text>
                                </View>
                                {/* Divider */}
                                <View className="h-10 w-px bg-border/50 mx-2" />
                                {/* Partner Stats */}
                                <View className="flex-1 items-center">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="font-bold text-base text-muted-foreground">{partner.name.split(' ')[0]}</Text>
                                    </View>
                                    <Text className="text-3xl font-black text-foreground">
                                        {summary.partnerApproved}<Text className="text-sm text-muted-foreground font-medium">/{summary.totalDays}</Text>
                                    </Text>
                                    <Text className="text-xs text-muted-foreground -mt-1 mb-1">Days Approved</Text>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Horizontal Timeline */}
                <View className="mb-6">
                    <Text className="text-sm font-bold px-4 mb-3 uppercase tracking-wider text-muted-foreground">Timeline</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16 }}
                    >
                        {days.map((item) => (
                            <View key={item.day}>
                                {renderTimelineItem({ item })}
                            </View>
                        ))}
                    </ScrollView>
                </View>

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

                    <View className="h-px bg-border my-6" />

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
                        <Text className="text-red-600 dark:text-red-400 font-medium">Stop Testing with {partner.name.split(' ')[0]}</Text>
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
            <TouchableOpacity
                onPress={() => setChatVisible(true)}
                className="absolute bottom-6 right-6 w-14 h-14 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/30 z-50 p-0"
                activeOpacity={0.8}
            >
                <Icon as={MessageSquareIcon} className="text-primary-foreground size-6" />
            </TouchableOpacity>

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
