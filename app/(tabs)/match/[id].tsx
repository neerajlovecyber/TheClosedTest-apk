import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Platform, useWindowDimensions, Pressable, Linking, Share } from 'react-native';
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
import { MessageSquareIcon, CalendarCheckIcon, InfoIcon, ChevronDownIcon, ChevronUpIcon, TrophyIcon, XCircleIcon, CheckCircle2Icon, ClockIcon, ArrowLeftIcon, ArrowRightLeftIcon, CheckIcon, XIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';
import { Button } from '@/components/ui/button';
import { ProofUploader } from '@/components/ProofUploader';
import { ProofReviewer } from '@/components/ProofReviewer';
import { ProgressGrid } from '@/components/ProgressGrid';
import { RejectionReasonModal } from '@/components/RejectionReasonModal';
import { MatchChat } from '@/components/MatchChat';
import { ReportDialog } from '@/components/ReportDialog';
import { useMatch, useMatchProofs, useCurrentUser, useRejectMatch, useAcceptMatch, ProofEntity } from '@/lib/api-hooks';

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

    const { data: match, isLoading: isLoadingMatch } = useMatch(matchId);
    const { data: allProofs = [] } = useMatchProofs(matchId);
    const rejectMatchMutation = useRejectMatch();
    const acceptMatchMutation = useAcceptMatch();

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

    const handleDayPress = (day: number) => {
        setSelectedDay(day);
    };

    if (isLoadingMatch || !match) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text>Loading match...</Text>
            </View>
        );
    }

    // Pending Request Screen (before match is accepted)
    if (match.status === 'pending') {
        const isRecipient = match.user2Id === currentUserId;
        const requestedApp = isRecipient ? match.app1 : match.app2;
        const yourApp = isRecipient ? match.app2 : match.app1;
        const requesterUser = match.user1;

        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
                {/* Header */}
                <View className="flex-row items-center px-4 py-3 border-b border-border justify-between">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                        <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                    </TouchableOpacity>
                    <Text className="text-lg font-bold text-foreground">
                        {isRecipient ? 'Testing Request' : 'Swap Request Pending'}
                    </Text>
                    <View className="w-6" />
                </View>

                <ScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false}>
                    {/* Status Card */}
                    <Card className={`mb-5 border ${isRecipient ? 'bg-primary/5 border-primary/20' : 'bg-orange-500/5 border-orange-500/20'}`}>
                        <CardContent className="p-4 items-center">
                            <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${isRecipient ? 'bg-primary/10' : 'bg-orange-500/10'}`}>
                                <Icon as={ArrowRightLeftIcon} className={`size-6 ${isRecipient ? 'text-primary' : 'text-orange-500'}`} />
                            </View>
                            <Text className="text-base font-bold text-foreground text-center mb-1">
                                {isRecipient ? 'Peer-Testing Swap Request' : 'Request Sent to Partner'}
                            </Text>
                            <Text className="text-xs text-muted-foreground text-center leading-relaxed">
                                {isRecipient
                                    ? `${requesterUser?.name || 'A developer'} wants to test their app with you for 14 days in exchange for testing your app.`
                                    : 'Waiting for the app owner to review and accept your swap request.'}
                            </Text>
                        </CardContent>
                    </Card>

                    {/* App Exchange Card */}
                    <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Exchange Overview</Text>
                    <Card className="mb-5 border-border bg-card">
                        <CardContent className="p-4 gap-4">
                            {/* Offered App */}
                            <View className="flex-row items-center gap-3">
                                <Image
                                    source={{ uri: requestedApp?.iconUrl || 'https://github.com/shadcn.png' }}
                                    style={{ width: 48, height: 48, borderRadius: 12 }}
                                    className="bg-muted"
                                />
                                <View className="flex-1">
                                    <Text className="text-[10px] font-bold text-muted-foreground uppercase">
                                        {isRecipient ? 'Their App (You Will Test)' : 'Their App'}
                                    </Text>
                                    <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                                        {requestedApp?.title}
                                    </Text>
                                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                                        {requestedApp?.packageName}
                                    </Text>
                                </View>
                            </View>

                            <View className="h-px bg-border my-1" />

                            {/* Your App */}
                            <View className="flex-row items-center gap-3">
                                <Image
                                    source={{ uri: yourApp?.iconUrl || 'https://github.com/shadcn.png' }}
                                    style={{ width: 48, height: 48, borderRadius: 12 }}
                                    className="bg-muted"
                                />
                                <View className="flex-1">
                                    <Text className="text-[10px] font-bold text-muted-foreground uppercase">
                                        {isRecipient ? 'Your App (They Will Test)' : 'Your App'}
                                    </Text>
                                    <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                                        {yourApp?.title}
                                    </Text>
                                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                                        {yourApp?.packageName}
                                    </Text>
                                </View>
                            </View>
                        </CardContent>
                    </Card>

                    {/* Testing Instructions Preview */}
                    {requestedApp?.instructions && (
                        <>
                            <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Testing Requirements</Text>
                            <Card className="mb-6 border-border bg-card">
                                <CardContent className="p-4">
                                    <Text className="text-sm text-foreground leading-relaxed">
                                        {requestedApp.instructions}
                                    </Text>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </ScrollView>

                {/* Footer Action Buttons */}
                <View className="p-4 border-t border-border bg-background gap-3">
                    {isRecipient ? (
                        <>
                            <Button
                                size="lg"
                                className="w-full rounded-2xl h-14 bg-green-600 shadow-md"
                                disabled={acceptMatchMutation.isPending || rejectMatchMutation.isPending}
                                onPress={async () => {
                                    try {
                                        await acceptMatchMutation.mutateAsync(matchId);
                                        toast.success('Accepted!', { description: 'Swap accepted! You can now start 14-day testing.' });
                                    } catch (e: any) {
                                        toast.error('Error', { description: e.message || 'Failed to accept request' });
                                    }
                                }}
                            >
                                <Icon as={CheckIcon} className="text-white size-5 mr-2" />
                                <Text className="text-white font-bold text-base">
                                    {acceptMatchMutation.isPending ? 'Accepting...' : 'Accept Swap & Start Testing'}
                                </Text>
                            </Button>

                            <Button
                                size="lg"
                                variant="outline"
                                className="w-full rounded-2xl h-12 border-destructive/40 text-destructive"
                                disabled={acceptMatchMutation.isPending || rejectMatchMutation.isPending}
                                onPress={async () => {
                                    try {
                                        await rejectMatchMutation.mutateAsync(matchId);
                                        toast.success('Declined');
                                        router.replace('/(tabs)/' as any);
                                    } catch (e: any) {
                                        toast.error('Error', { description: e.message || 'Failed to decline request' });
                                    }
                                }}
                            >
                                <Icon as={XIcon} className="text-destructive size-4 mr-2" />
                                <Text className="text-destructive font-bold text-sm">
                                    {rejectMatchMutation.isPending ? 'Declining...' : 'Decline Request'}
                                </Text>
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="lg"
                            variant="destructive"
                            className="w-full rounded-2xl h-13"
                            disabled={rejectMatchMutation.isPending}
                            onPress={async () => {
                                try {
                                    await rejectMatchMutation.mutateAsync(matchId);
                                    toast.success('Request Cancelled');
                                    router.replace('/(tabs)/' as any);
                                } catch (e: any) {
                                    toast.error('Error', { description: e.message || 'Failed to cancel request' });
                                }
                            }}
                        >
                            <Icon as={XIcon} className="text-white size-4 mr-2" />
                            <Text className="text-white font-bold text-sm">
                                {rejectMatchMutation.isPending ? 'Cancelling...' : 'Cancel Swap Request'}
                            </Text>
                        </Button>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    const isUser1 = match.user1Id === currentUserId;
    const partner = isUser1 ? match.user2 : match.user1;
    const partnerApp = isUser1 ? match.app2 : match.app1;
    const myApp = isUser1 ? match.app1 : match.app2;

    const myProofs = allProofs.filter((p: ProofEntity) => p.uploaderId === currentUserId);
    const partnerProofs = allProofs.filter((p: ProofEntity) => p.uploaderId !== currentUserId);

    const currentDay = Math.min(14, Math.max(1, (isUser1 ? match.user1LastProof?.day : match.user2LastProof?.day) || 1));
    const effectiveDay = selectedDay ?? currentDay;
    const isCompleted = match.status === 'completed';

    const handleRejectPress = (proofId: string) => {
        setProofToReject(proofId);
        setRejectionModalVisible(true);
    };

    const selectedDayMyProof = allProofs.find(
        (p: ProofEntity) => p.day === effectiveDay && p.uploaderId === currentUserId,
    );
    const selectedDayPartnerProof = allProofs.find(
        (p: ProofEntity) => p.day === effectiveDay && p.uploaderId !== currentUserId,
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
            myStatus: myP ? myP.status : (dayNum === currentDay ? 'pending' : 'not_started'),
            partnerStatus: partnerP ? partnerP.status : (dayNum === currentDay ? 'pending' : 'not_started'),
            isToday: dayNum === currentDay,
        };
    });

    const summary = {
        myApproved: isUser1 ? match.user1ApprovedCount : match.user2ApprovedCount,
        partnerApproved: isUser1 ? match.user2ApprovedCount : match.user1ApprovedCount,
        totalDays: 14,
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right']}>
            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: isWeb ? 40 : 60 }}
                style={!isWeb ? { width: SCREEN_WIDTH } : undefined}
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
                                        <Text className="text-sm text-muted-foreground mt-1 font-semibold">Partner's Proofs</Text>
                                    </View>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Progress Grid */}
                {!isCompleted && (
                    <View className="mb-3">
                        <ProgressGrid
                            days={daysProgress as any}
                            currentDay={currentDay}
                            summary={summary as any}
                            onDayPress={handleDayPress}
                            selectedDay={effectiveDay}
                        />
                    </View>
                )}

                {/* Day View */}
                {!isCompleted && (
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
                                    onPress={() => effectiveDay < currentDay && setSelectedDay(effectiveDay + 1)}
                                    className={`w-8 h-8 rounded-full items-center justify-center ${effectiveDay >= currentDay ? 'bg-muted/30' : 'bg-primary'}`}
                                    disabled={effectiveDay >= currentDay}
                                >
                                    <Text className={`font-bold ${effectiveDay >= currentDay ? 'text-muted-foreground/30' : 'text-primary-foreground'}`}>→</Text>
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

                {!isCompleted && (
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

            {/* Chat Floating Action Button */}
            <View className="absolute bottom-6 right-6 z-50">
                <TouchableOpacity
                    onPress={() => setChatVisible(true)}
                    className="w-14 h-14 bg-primary rounded-full items-center justify-center shadow-lg shadow-primary/30 p-0"
                    activeOpacity={0.8}
                >
                    <Icon as={MessageSquareIcon} className="text-primary-foreground size-6" />
                </TouchableOpacity>
            </View>

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
        </SafeAreaView>
    );
}
