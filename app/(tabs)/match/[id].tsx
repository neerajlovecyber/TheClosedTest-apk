import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity, Platform, useWindowDimensions, Pressable, Linking, Share } from 'react-native';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MessageSquareIcon, CalendarCheckIcon, InfoIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, XCircleIcon, CheckCircle2Icon, ClockIcon, ArrowLeftIcon, ArrowRightLeftIcon, CheckIcon, XIcon, FlagIcon, RotateCwIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';
import { Button } from '@/components/ui/button';
import { ProofUploader } from '@/components/ProofUploader';
import { ProofReviewer } from '@/components/ProofReviewer';
import { ProgressGrid } from '@/components/ProgressGrid';
import { RejectionReasonModal } from '@/components/RejectionReasonModal';
import { MatchChat } from '@/components/MatchChat';
import { ReportDialog } from '@/components/ReportDialog';
import { useMatch, useMatchProofs, useCurrentUser, useRejectMatch, useAcceptMatch, useMatchMessages, ProofEntity } from '@/lib/api-hooks';

const isWeb = Platform.OS === 'web';

const getTimeUntilMidnightIST = () => {
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const nowIST = now + IST_OFFSET;
    const currentDayIST = Math.floor(nowIST / DAY_MS);
    const nextMidnightIST = (currentDayIST + 1) * DAY_MS;
    const timeRemaining = nextMidnightIST - nowIST;

    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

    return { hours, minutes, seconds, totalMs: timeRemaining };
};

export default function MatchDashboardScreen() {
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const matchId = id as string;

    const { data: currentUser } = useCurrentUser();
    const currentUserId = currentUser?.id;

    const { data: match, isLoading: isLoadingMatch, refetch: refetchMatch, isFetching: isFetchingMatch } = useMatch(matchId);
    const { data: apiProofs, refetch: refetchProofs, isFetching: isFetchingProofs } = useMatchProofs(matchId);
    const { data: messages = [], refetch: refetchMessages } = useMatchMessages(matchId);
    const rejectMatchMutation = useRejectMatch();
    const acceptMatchMutation = useAcceptMatch();

    const [isManualRefreshing, setIsManualRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setIsManualRefreshing(true);
        try {
            await Promise.all([
                refetchMatch(),
                refetchProofs(),
                refetchMessages(),
            ]);
            toast.success('Refreshed', { description: 'Latest proofs and status updated.' });
        } catch (e: any) {
            toast.error('Refresh Failed', { description: e.message });
        } finally {
            setIsManualRefreshing(false);
        }
    }, [refetchMatch, refetchProofs, refetchMessages]);

    const [chatVisible, setChatVisible] = useState(false);
    const [reportDialogVisible, setReportDialogVisible] = useState(false);
    const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
    const [proofToReject, setProofToReject] = useState<string | null>(null);
    const [instructionsExpanded, setInstructionsExpanded] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    useEffect(() => {
        setSelectedDay(null);
    }, [matchId]);

    const [timeUntilReset, setTimeUntilReset] = useState(getTimeUntilMidnightIST());

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeUntilReset(getTimeUntilMidnightIST());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const isUser1 = match?.user1Id === currentUserId;
    const myLastRead = isUser1 ? match?.lastRead1 : match?.lastRead2;

    const hasUnreadChat = useMemo(() => {
        if (!currentUserId || messages.length === 0) return false;
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.senderId === currentUserId || lastMsg.senderId === 'me') return false;
        if (!myLastRead) return true;
        return new Date(lastMsg.sentAt).getTime() > new Date(myLastRead).getTime();
    }, [messages, currentUserId, myLastRead]);

    const handleDayPress = (day: number) => {
        setSelectedDay(day);
    };

    // Use embedded match.proofs instantly if available, avoiding network waterfall delay
    const allProofs: ProofEntity[] = useMemo(() => {
        if (apiProofs && apiProofs.length > 0) return apiProofs;
        if (match?.proofs && match.proofs.length > 0) return match.proofs;
        return apiProofs || [];
    }, [apiProofs, match?.proofs]);

    if (isLoadingMatch || !match) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text>Loading match...</Text>
            </View>
        );
    }

    const partner = isUser1 ? match.user2 : match.user1;
    const partnerApp = isUser1 ? match.app2 : match.app1;
    const myApp = isUser1 ? match.app1 : match.app2;

    const partnerUserId = isUser1 ? match.user2Id : match.user1Id;
    const myUserId = isUser1 ? match.user1Id : match.user2Id;

    const myProofs = allProofs.filter((p: ProofEntity) => p.uploaderId === myUserId);
    const partnerProofs = allProofs.filter((p: ProofEntity) => p.uploaderId === partnerUserId);

    const myLastProof = isUser1 ? match.user1LastProof : match.user2LastProof;
    const partnerLastProof = isUser1 ? match.user2LastProof : match.user1LastProof;

    // Check if there is a pending partner proof that needs user's review
    const pendingPartnerProof = partnerProofs.find((p: ProofEntity) => p.status === 'pending');

    const defaultDay = pendingPartnerProof
        ? pendingPartnerProof.day
        : (partnerLastProof?.status === 'pending' && partnerLastProof.day)
            ? partnerLastProof.day
            : Math.min(14, Math.max(1, myLastProof?.day || 1, partnerLastProof?.day || 1));

    const currentDay = defaultDay;
    const effectiveDay = selectedDay ?? currentDay;
    const isCompleted = match.status === 'completed';
    const isCancelled = match.status === 'cancelled' || match.status === 'rejected' || match.status === 'archived';

    const handleRejectPress = (proofId: string) => {
        setProofToReject(proofId);
        setRejectionModalVisible(true);
    };

    const selectedDayMyProof = allProofs.find(
        (p: ProofEntity) => p.day === effectiveDay && p.uploaderId === myUserId,
    );
    const selectedDayPartnerProof = allProofs.find(
        (p: ProofEntity) => p.day === effectiveDay && p.uploaderId === partnerUserId,
    );

    const handleLeaveMatch = () => {
        setShowLeaveConfirm(true);
    };

    const confirmLeaveMatch = async () => {
        if (!matchId) return;
        try {
            await rejectMatchMutation.mutateAsync(matchId);
            router.replace('/(tabs)/' as any);
        } catch (e: any) {
            console.error(e);
            toast.error('Error', { description: 'Failed to cancel match' });
        } finally {
            setShowLeaveConfirm(false);
        }
    };

    const handleOpenApp = async () => {
        if (!partnerApp?.packageName) {
            toast.error('Error', { description: 'Package name not available' });
            return;
        }

        const packageName = partnerApp.packageName;
        const marketUrl = `market://details?id=${packageName}`;
        const webUrl = partnerApp.playStoreUrl || `https://play.google.com/store/apps/details?id=${packageName}`;

        const openPlayStore = () => {
            Linking.canOpenURL(marketUrl).then((supported) => {
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
                // @ts-ignore
                await IntentLauncher.openApplication(packageName);
            } catch {
                openPlayStore();
            }
        } else {
            openPlayStore();
        }
    };

    const daysProgress = Array.from({ length: 14 }, (_, i) => {
        const dayNum = i + 1;
        const myP = myProofs.find((p) => p.day === dayNum);
        const partnerP = partnerProofs.find((p) => p.day === dayNum);

        return {
            day: dayNum,
            myStatus: myP ? myP.status : (dayNum > currentDay ? 'future' : 'not_uploaded'),
            partnerStatus: partnerP ? partnerP.status : (dayNum > currentDay ? 'future' : 'not_uploaded'),
            isToday: dayNum === currentDay,
        };
    });

    const summary = {
        myApproved: isUser1 ? match.user1ApprovedCount : match.user2ApprovedCount,
        partnerApproved: isUser1 ? match.user2ApprovedCount : match.user1ApprovedCount,
        totalDays: 14,
    };

    return (
        <View className="flex-1 bg-background">
            {/* Top Navigation Bar */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-border bg-background">
                <View className="flex-row items-center gap-2 flex-1">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full active:bg-secondary">
                        <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-lg font-bold text-foreground" numberOfLines={1}>Testing Dashboard</Text>
                        <Text className="text-xs text-muted-foreground font-medium" numberOfLines={1}>
                            {isCancelled ? 'Match Ended' : isCompleted ? 'Completed' : `Day ${currentDay} of 14`}
                        </Text>
                    </View>
                </View>

                <View className="flex-row items-center gap-2">
                    {/* Reload / Refresh Button */}
                    <TouchableOpacity
                        onPress={handleRefresh}
                        disabled={isManualRefreshing || isFetchingMatch || isFetchingProofs}
                        activeOpacity={0.7}
                        className="p-2.5 rounded-full bg-secondary/40 border border-border/50 flex-row items-center justify-center"
                    >
                        <Icon as={RotateCwIcon} className="size-4 text-foreground" />
                    </TouchableOpacity>

                    {/* Report Partner Button */}
                    <TouchableOpacity
                        onPress={() => setReportDialogVisible(true)}
                        activeOpacity={0.7}
                        className="p-2.5 rounded-full bg-secondary/40 border border-border/50 flex-row items-center justify-center"
                    >
                        <Icon as={FlagIcon} className="size-4 text-muted-foreground" />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: isWeb ? 40 : 60 }}
                style={!isWeb ? { width: SCREEN_WIDTH } : undefined}
                refreshControl={
                    <RefreshControl
                        refreshing={isManualRefreshing || isFetchingMatch || isFetchingProofs}
                        onRefresh={handleRefresh}
                    />
                }
            >
                {/* Header Section */}
                <View className="px-4 pt-4 pb-2">
                    <View className="flex-row items-center gap-3 mb-3">
                        <Image
                            source={{ uri: partnerApp?.iconUrl || 'https://github.com/shadcn.png' }}
                            style={{ width: 60, height: 60, borderRadius: 14 }}
                            contentFit="cover"
                            transition={200}
                            className="bg-muted"
                        />
                        <View className="flex-1">
                            <Text className="text-xl font-bold" numberOfLines={1}>{partnerApp?.title || 'Testing'}</Text>
                            <Text className="text-xs text-muted-foreground" numberOfLines={1}>{partnerApp?.packageName}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleOpenApp}
                            className="bg-primary px-3 py-2 rounded-lg"
                        >
                            <Text className="text-primary-foreground font-bold text-sm">Open</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Testing Instructions */}
                    <Pressable
                        onPress={() => setInstructionsExpanded(!instructionsExpanded)}
                        className="bg-secondary/30 rounded-lg p-2.5 flex-row items-center justify-between"
                    >
                        <View className="flex-row items-center flex-1">
                            <Icon as={InfoIcon} className="text-primary size-4 mr-2" />
                            <Text className="font-medium text-sm">Testing Instructions</Text>
                        </View>
                        <Icon as={instructionsExpanded ? ChevronUpIcon : ChevronDownIcon} className="text-muted-foreground size-4" />
                    </Pressable>
                    {instructionsExpanded && (
                        <Card className="bg-secondary/10 mt-2">
                            <CardContent className="p-3">
                                <Text className="text-muted-foreground text-sm">{partnerApp?.instructions || 'Follow the testing instructions'}</Text>
                            </CardContent>
                        </Card>
                    )}
                </View>

                {/* Celebration Banner if Completed */}
                {isCompleted && (
                    <View className="px-4 flex-1">
                        <Card className="bg-gradient-to-br from-amber-500/15 via-green-500/10 to-emerald-500/15 border-amber-500/40 mb-4">
                            <CardContent className="p-6">
                                <View className="items-center mb-6">
                                    <View className="bg-gradient-to-br from-amber-400 to-amber-600 p-4 rounded-full mb-4 shadow-lg">
                                        <Icon as={TrophyIcon} className="size-12 text-white" />
                                    </View>
                                    <Text className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 text-center">
                                        🎉 14-Day Testing Complete!
                                    </Text>
                                    <Text className="text-sm text-muted-foreground mt-1">
                                        You've successfully completed this testing journey
                                    </Text>
                                </View>

                                <View className="flex-row gap-4 mb-6">
                                    <View className="flex-1 bg-green-500/15 rounded-xl p-4 items-center border border-green-500/30">
                                        <View className="bg-green-500/20 p-2 rounded-full mb-2">
                                            <Icon as={CheckCircle2Icon} className="size-6 text-green-600" />
                                        </View>
                                        <Text className="text-3xl font-extrabold text-green-600">
                                            {isUser1 ? match.user1ApprovedCount : match.user2ApprovedCount}
                                        </Text>
                                        <Text className="text-xs text-green-600/80 font-medium">out of 14</Text>
                                        <Text className="text-sm text-muted-foreground mt-1 font-semibold">Your Proofs</Text>
                                    </View>
                                    <View className="flex-1 bg-blue-500/15 rounded-xl p-4 items-center border border-blue-500/30">
                                        <View className="bg-blue-500/20 p-2 rounded-full mb-2">
                                            <Icon as={CheckCircle2Icon} className="size-6 text-blue-600" />
                                        </View>
                                        <Text className="text-3xl font-extrabold text-blue-600">
                                            {isUser1 ? match.user2ApprovedCount : match.user1ApprovedCount}
                                        </Text>
                                        <Text className="text-xs text-blue-600/80 font-medium">out of 14</Text>
                                        <Text className="text-sm text-muted-foreground mt-1 font-semibold">Partner Proofs</Text>
                                    </View>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Cancelled Banner if Match Ended */}
                {isCancelled && (
                    <View className="px-4 mb-4">
                        <Card className="bg-red-500/10 border-red-500/30">
                            <CardContent className="p-5 items-center">
                                <View className="w-12 h-12 rounded-full bg-red-500/20 items-center justify-center mb-3">
                                    <Icon as={XCircleIcon} className="size-6 text-red-500" />
                                </View>
                                <Text className="text-xl font-bold text-red-600 dark:text-red-400 text-center">
                                    Testing Match Ended
                                </Text>
                                <Text className="text-sm text-muted-foreground text-center mt-1 mb-4">
                                    This testing swap was cancelled or left. Daily screenshot uploads and proof reviews are no longer active for this app.
                                </Text>
                                <View className="flex-row gap-3 w-full">
                                    <Button
                                        variant="outline"
                                        onPress={() => router.replace('/(tabs)/tests' as any)}
                                        className="flex-1"
                                    >
                                        <Text className="text-foreground font-semibold text-xs">My Tasks</Text>
                                    </Button>
                                    <Button
                                        onPress={() => router.replace('/(tabs)/marketplace' as any)}
                                        className="flex-1"
                                    >
                                        <Text className="text-primary-foreground font-semibold text-xs">Browse Marketplace</Text>
                                    </Button>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Progress Tracker (Horizontal Scroll View) */}
                <View className="mb-4">
                    <ProgressGrid
                        days={daysProgress.map(d => ({
                            ...d,
                            isFuture: d.day > currentDay,
                            myProof: myProofs.find(p => p.day === d.day),
                            partnerProof: partnerProofs.find(p => p.day === d.day),
                        }))}
                        currentDay={currentDay}
                        summary={summary}
                        onDayPress={handleDayPress}
                        selectedDay={effectiveDay}
                    />
                </View>

                {/* Day View */}
                {!isCompleted && !isCancelled && (
                    <View className="px-4">
                        <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-base font-bold">Day {effectiveDay}</Text>
                                {effectiveDay === currentDay && (
                                    <View className="bg-primary px-1.5 py-0.5 rounded-md">
                                        <Text className="text-[9px] font-bold text-primary-foreground">TODAY</Text>
                                    </View>
                                )}
                                {effectiveDay === currentDay && (
                                    <View className="flex-row items-center">
                                        <Icon as={ClockIcon} className="text-orange-500 size-3 mr-1" />
                                        <Text className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                                            {timeUntilReset.hours}h {timeUntilReset.minutes}m
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View className="flex-row items-center gap-2">
                                <TouchableOpacity
                                    onPress={() => effectiveDay > 1 && setSelectedDay(effectiveDay - 1)}
                                    className={`w-8 h-8 rounded-full items-center justify-center ${effectiveDay <= 1 ? 'bg-muted/30' : 'bg-primary'}`}
                                    disabled={effectiveDay <= 1}
                                >
                                    <Text className={`font-bold ${effectiveDay <= 1 ? 'text-muted-foreground/30' : 'text-primary-foreground'}`}>←</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => effectiveDay < 14 && setSelectedDay(effectiveDay + 1)}
                                    className={`w-8 h-8 rounded-full items-center justify-center ${effectiveDay >= 14 ? 'bg-muted/30' : 'bg-primary'}`}
                                    disabled={effectiveDay >= 14}
                                >
                                    <Text className={`font-bold ${effectiveDay >= 14 ? 'text-muted-foreground/30' : 'text-primary-foreground'}`}>→</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your Proof</Text>
                        <ProofUploader
                            matchId={matchId}
                            currentDay={effectiveDay}
                            todayProof={selectedDayMyProof ? {
                                status: selectedDayMyProof.status,
                                urls: selectedDayMyProof.storageUrls,
                                comment: selectedDayMyProof.comment || undefined,
                                rejectionReason: selectedDayMyProof.rejectionReason || undefined,
                            } : null}
                            isCompleted={isCompleted}
                            isFuture={effectiveDay > currentDay}
                        />

                        <View className="h-px bg-border my-2" />

                        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Partner's Proof</Text>
                        <ProofReviewer
                            matchId={matchId}
                            partnerProof={selectedDayPartnerProof ? {
                                _id: selectedDayPartnerProof.id,
                                day: selectedDayPartnerProof.day,
                                urls: selectedDayPartnerProof.storageUrls,
                                comment: selectedDayPartnerProof.comment || undefined,
                                partnerName: partner?.name || 'Partner',
                                status: selectedDayPartnerProof.status,
                            } : null}
                            onReject={handleRejectPress}
                        />
                    </View>
                )}

                {!isCompleted && !isCancelled && (
                    <View className="px-4 mt-2">
                        <TouchableOpacity
                            onPress={handleLeaveMatch}
                            className="flex-row items-center justify-center p-3.5 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/50 w-full mb-6"
                        >
                            <Icon as={XCircleIcon} className="text-red-500 size-4 mr-2" />
                            <Text className="text-red-600 dark:text-red-400 font-medium">Stop Testing with {partner?.name?.split(' ')[0] || 'Partner'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Chat Floating Action Button with Live Red Dot Indicator */}
            {!isCancelled && (
                <View className="absolute bottom-6 right-6 z-50">
                <TouchableOpacity
                    onPress={() => setChatVisible(true)}
                    className="relative w-14 h-14 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/30 p-0"
                    activeOpacity={0.8}
                >
                    <Icon as={MessageSquareIcon} className="text-primary-foreground size-6" />
                    {hasUnreadChat && (
                        <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-background shadow-sm" />
                    )}
                </TouchableOpacity>
            </View>
            )}

            <MatchChat
                visible={chatVisible}
                onClose={() => setChatVisible(false)}
                matchId={matchId}
                partnerName={partner?.name || 'Partner'}
                currentUserId={currentUserId}
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
                reportedUserId={partner?.id}
                targetName={partner?.name || 'Partner'}
            />

            <RejectionReasonModal
                visible={rejectionModalVisible}
                proofId={proofToReject as any}
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
        </View>
    );
}
