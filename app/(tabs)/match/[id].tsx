import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image as RNImage, TouchableOpacity, TextInput, Platform, FlatList, Keyboard, useWindowDimensions, Pressable, Modal, KeyboardAvoidingView as RNKeyboardAvoidingView, Linking } from 'react-native';
import { toast } from '@/lib/sonner';
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
import { SendIcon, MessageSquareIcon, CalendarCheckIcon, BarChart3Icon, InfoIcon, UploadIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, XCircleIcon, CheckCircle2Icon, ExternalLinkIcon, ClockIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';
import { ProofUploader } from '@/components/ProofUploader';
import { ProofReviewer } from '@/components/ProofReviewer';
import { ProgressGrid } from '@/components/ProgressGrid';
import { RejectionReasonModal } from '@/components/RejectionReasonModal';
import { MatchChat } from '@/components/MatchChat';
import { ReportDialog } from '@/components/ReportDialog';
const isWeb = Platform.OS === 'web';

// Calculate time until next midnight IST
const getTimeUntilMidnightIST = () => {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Current IST time
    const nowIST = now + IST_OFFSET;

    // Next midnight IST
    const currentDayIST = Math.floor(nowIST / DAY_MS);
    const nextMidnightIST = (currentDayIST + 1) * DAY_MS;

    // Time remaining until next midnight IST
    const timeRemaining = nextMidnightIST - nowIST;

    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

    return { hours, minutes, seconds, totalMs: timeRemaining };
};

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

    // Get all proofs for day-specific modal
    const { data: allProofs } = useCachedConvexQuery(['allProofs', matchId], api.matches.getProofs, { matchId });

    // Mutations
    const cancelMatchMutation = useMutation(api.matches.cancelMatch);

    // Navigation State
    const [chatVisible, setChatVisible] = useState(false);
    const [reportDialogVisible, setReportDialogVisible] = useState(false);

    const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
    const [proofToReject, setProofToReject] = useState<Id<"proofs"> | null>(null);
    const [proofToRejectUrls, setProofToRejectUrls] = useState<string[]>([]);
    const [instructionsExpanded, setInstructionsExpanded] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    // Selected day for inline view (defaults to current day after data loads)
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    // Reset selectedDay when switching to a different match
    useEffect(() => {
        setSelectedDay(null);
    }, [matchId]);

    // Countdown timer state
    const [timeUntilReset, setTimeUntilReset] = useState(getTimeUntilMidnightIST());

    // Update countdown every second
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeUntilReset(getTimeUntilMidnightIST());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Handle day card press - inline selection
    const handleDayPress = (day: number) => {
        setSelectedDay(day);
    };




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

    // Effective selected day (defaults to current day if none selected)
    const effectiveDay = selectedDay ?? currentDay;

    // Get proofs for the selected day
    const selectedDayMyProof = effectiveDay && allProofs ?
        allProofs.find((p: any) => p.day === effectiveDay && p.isMe) : null;

    const selectedDayPartnerProof = effectiveDay && allProofs ?
        allProofs.find((p: any) => p.day === effectiveDay && !p.isMe) : null;

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
        setShowLeaveConfirm(true);
    };

    const confirmLeaveMatch = async () => {
        if (!matchId) return;
        try {
            await cancelMatchMutation({ matchId });
            await cancelMatchMutation({ matchId }); // Why twice? maintaining original logic but seems redundant
            router.replace("/(tabs)/" as any);
        } catch (e: any) {
            console.error(e);
            toast.error("Error", { description: "Failed to cancel match" });
        } finally {
            setShowLeaveConfirm(false);
        }
    };

    const handleOpenApp = async () => {
        if (!app?.packageName) {
            toast.error("Error", { description: "Package name not available" });
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

        // Client-side override to ensure 'Today' always shows 'pending' (clock) instead of 'missed' if no proof is uploaded
        const days = (progressData?.days || []).map((d: any) => {
            if (d.day === currentDay) {
                return {
                    ...d,
                    myStatus: d.myStatus === 'missed' ? 'pending' : d.myStatus,
                    partnerStatus: d.partnerStatus === 'missed' ? 'pending' : d.partnerStatus,
                    isToday: true
                };
            }
            return d;
        });

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
                            <Text className="text-2xl font-bold" numberOfLines={1}>{app?.title || 'Testing'}</Text>
                            <Text className="text-sm text-muted-foreground" numberOfLines={1}>{app?.packageName}</Text>
                        </View>
                    </View>

                    {/* Testing Instructions - Collapsible */}
                    <Pressable
                        onPress={() => setInstructionsExpanded(!instructionsExpanded)}
                        className="bg-secondary/30 rounded-xl p-3  flex-row items-center justify-between"
                    >
                        <View className="flex-row items-center flex-1">
                            <Icon as={InfoIcon} className="text-primary size-4 mr-2" />
                            <Text className="font-medium text-sm">Testing Instructions</Text>
                        </View>
                        <Icon as={instructionsExpanded ? ChevronUpIcon : ChevronDownIcon} className="text-muted-foreground size-5" />
                    </Pressable>
                    {instructionsExpanded && (
                        <Card className="bg-secondary/10 mt-2">
                            <CardContent className="p-3">
                                <Text className="text-muted-foreground text-sm">{app?.instructions || 'Follow the testing instructions'}</Text>
                            </CardContent>
                        </Card>
                    )}

                    {/* Open App Button */}
                    <TouchableOpacity
                        onPress={handleOpenApp}
                        className="flex-row items-center justify-center bg-primary mt-3 p-2.5 rounded-xl"
                    >
                        <Icon as={ExternalLinkIcon} className="text-primary-foreground size-4 mr-2" />
                        <Text className="text-primary-foreground font-bold text-base">Open {app?.title || 'App'}</Text>
                    </TouchableOpacity>
                </View>



                {/* Progress Grid with Integrated Score Card */}
                {
                    summary && (
                        <View className="mb-4">
                            <Text className="text-sm font-bold px-4 mb-3 uppercase tracking-wider text-muted-foreground">14-Day Progress & Status</Text>
                            <ProgressGrid days={days} currentDay={currentDay} summary={summary} onDayPress={handleDayPress} selectedDay={effectiveDay} />
                        </View>
                    )
                }

                {/* Unified Day View - Shows selected day's proofs */}
                <View className="px-4">
                    {/* Day Header with Navigation */}
                    <View className="flex-row items-center justify-between mb-3">
                        <View>
                            <View className="flex-row items-center gap-2">
                                <Text className="text-lg font-bold">Day {effectiveDay}</Text>
                                {effectiveDay === currentDay && (
                                    <View className="bg-primary px-2 py-0.5 rounded-full">
                                        <Text className="text-[10px] font-bold text-primary-foreground">TODAY</Text>
                                    </View>
                                )}
                            </View>
                            {effectiveDay === currentDay ? (
                                <View className="flex-row items-center mt-1">
                                    <Icon as={ClockIcon} className="text-orange-500 size-3.5 mr-1" />
                                    <Text className="text-xs font-medium text-orange-600 dark:text-orange-400">
                                        {timeUntilReset.hours}h {timeUntilReset.minutes}m remaining
                                    </Text>
                                </View>
                            ) : (
                                <Text className="text-xs text-muted-foreground mt-1">
                                    {effectiveDay < currentDay ? "Day Completed" : "Future Day"}
                                </Text>
                            )}
                        </View>

                        <View className="flex-row items-center gap-2">
                            <TouchableOpacity
                                onPress={() => effectiveDay > 1 && setSelectedDay(effectiveDay - 1)}
                                className={`w-9 h-9 rounded-full items-center justify-center ${effectiveDay <= 1 ? 'bg-muted/30' : 'bg-primary'}`}
                                disabled={effectiveDay <= 1}
                            >
                                <Text className={`font-bold text-lg ${effectiveDay <= 1 ? 'text-muted-foreground/30' : 'text-primary-foreground'}`}>←</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => effectiveDay < currentDay && setSelectedDay(effectiveDay + 1)}
                                className={`w-9 h-9 rounded-full items-center justify-center ${effectiveDay >= currentDay ? 'bg-muted/30' : 'bg-primary'}`}
                                disabled={effectiveDay >= currentDay}
                            >
                                <Text className={`font-bold text-lg ${effectiveDay >= currentDay ? 'text-muted-foreground/30' : 'text-primary-foreground'}`}>→</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <SectionTitle icon={UploadIcon} title="Your Proof" />
                    <ProofUploader matchId={matchId} currentDay={effectiveDay} todayProof={selectedDayMyProof} />

                    <View className="h-px bg-border my-3" />

                    <SectionTitle icon={EyeIcon} title="Partner's Proof" />
                    <ProofReviewer matchId={matchId} partnerProof={selectedDayPartnerProof} onReject={handleRejectPress} />
                </View>
                <View className="h-px bg-border mb-6 mt-2 mx-3 " />
                {/* Leave Match Button */}
                <View className="px-4 mt-2">
                    <TouchableOpacity
                        onPress={handleLeaveMatch}
                        className="flex-row items-center justify-center p-3.5 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/50 w-full mb-6"
                    >
                        <Icon as={XCircleIcon} className="text-red-500 size-4 mr-2" />
                        <Text className="text-red-600 dark:text-red-400 font-medium">Stop Testing with {partner?.name?.split(' ')[0] || "Partner"}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView >
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
                onReport={() => {
                    setChatVisible(false);
                    setReportDialogVisible(true);
                }}
            />

            <ReportDialog
                visible={reportDialogVisible}
                onClose={() => setReportDialogVisible(false)}
                reportType="user"
                targetId={matchId}
                matchId={matchId}
                reportedUserId={partner?._id}
                targetName={partner?.name || "Partner"}
            />

            <RejectionReasonModal
                visible={rejectionModalVisible}
                proofId={proofToReject}
                onClose={() => { setRejectionModalVisible(false); setProofToReject(null); }}
            />

            <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stop Testing?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to cancel this match? This action cannot be undone and you will lose your progress.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowLeaveConfirm(false)}>
                            <Text>Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction onPress={confirmLeaveMatch}>
                            <Text>Stop Testing</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SafeAreaView>
    );
}
