import React, { useState } from 'react';
import { View, ScrollView, RefreshControl, Image, TouchableOpacity, Platform } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { PendingRequestCard } from '@/components/PendingRequestCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { BellIcon, CheckCircleIcon, FlameIcon, StarIcon, PlusIcon, LockIcon, PlayCircleIcon } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
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

import {
    useCurrentUser,
    useMyApps,
    useMatches,
    useNotifications,
    useCheckIn,
    useAcceptMatch,
    useRejectMatch,
    MatchEntity,
} from '@/lib/api-hooks';

export default function HomeScreen() {
    const { user } = useUser();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [requestToReject, setRequestToReject] = useState<string | null>(null);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const attentionScrollRef = React.useRef<ScrollView>(null);

    // API Queries
    const { data: currentUser, refetch: refetchUser } = useCurrentUser();
    const { data: myApps = [], refetch: refetchMyApps } = useMyApps();
    const { data: activeMatches = [], refetch: refetchActive } = useMatches('active');
    const { data: pendingMatches = [], refetch: refetchPending } = useMatches('pending');
    const { data: notificationsData, refetch: refetchNotifications } = useNotifications();

    const unreadCount = notificationsData?.unreadCount ?? 0;

    // Mutations
    const checkIn = useCheckIn();
    const acceptMatch = useAcceptMatch();
    const rejectMatch = useRejectMatch();

    // Derived user data
    const userName = user?.firstName || 'Tester';
    const reputation = currentUser?.reputation ?? 100;
    const streak = currentUser?.streak ?? 0;
    const unlockedSlots = currentUser?.unlockedAppSlots ?? 1;

    // Check-in trigger once per calendar day
    React.useEffect(() => {
        if (currentUser) {
            const now = new Date();
            const lastCheckIn = new Date(currentUser.lastCheckInDate || 0);

            const isSameDay =
                now.getFullYear() === lastCheckIn.getFullYear() &&
                now.getMonth() === lastCheckIn.getMonth() &&
                now.getDate() === lastCheckIn.getDate();

            if (!isSameDay) {
                checkIn.mutateAsync().catch(() => {});
            }
        }
    }, [currentUser?.lastCheckInDate]);

    // Format active matches into task objects
    const dueTasks = React.useMemo(() => {
        return activeMatches
            .map((m: MatchEntity) => {
                const isUser1 = m.user1Id === currentUser?.id;
                const partnerApp = isUser1 ? m.app2 : m.app1;
                const myLastProof = isUser1 ? m.user1LastProof : m.user2LastProof;
                const partnerLastProof = isUser1 ? m.user2LastProof : m.user1LastProof;

                const myProofStatus = myLastProof?.status || 'not_uploaded';
                const partnerProofStatus = partnerLastProof?.status || 'not_uploaded';
                const isReviewPending = partnerLastProof?.status === 'pending';

                const day = myLastProof?.day || 1;

                return {
                    id: m.id,
                    name: partnerApp?.title || 'Testing App',
                    owner: partnerApp?.user?.name || 'Partner',
                    day,
                    totalDays: 14,
                    iconUrl: partnerApp?.iconUrl,
                    myProofStatus,
                    partnerProofStatus,
                    isReviewPending,
                    hasUnread: false,
                };
            })
            .filter((t) => {
                if (t.isReviewPending) return true;
                if (t.myProofStatus === 'not_uploaded' || t.myProofStatus === 'rejected') return true;
                return false;
            })
            .sort((a, b) => {
                if (a.isReviewPending && !b.isReviewPending) return -1;
                if (!a.isReviewPending && b.isReviewPending) return 1;
                return 0;
            });
    }, [activeMatches, currentUser?.id]);

    const incomingRequests = React.useMemo(() => {
        return pendingMatches.filter((m) => m.user2Id === currentUser?.id);
    }, [pendingMatches, currentUser?.id]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                refetchUser(),
                refetchMyApps(),
                refetchActive(),
                refetchPending(),
                refetchNotifications(),
            ]);
        } finally {
            setRefreshing(false);
        }
    }, [refetchUser, refetchMyApps, refetchActive, refetchPending, refetchNotifications]);

    const handleAccept = async (matchId: string) => {
        try {
            await acceptMatch.mutateAsync(matchId);
            toast.success('Success', { description: 'Swap accepted! You can now start testing.' });
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to accept swap.' });
        }
    };

    const handleReject = (matchId: string) => {
        setRequestToReject(matchId);
        setIsRejectDialogOpen(true);
    };

    const confirmReject = async () => {
        if (!requestToReject) return;
        try {
            await rejectMatch.mutateAsync(requestToReject);
            toast.success('Rejected', { description: 'Swap request declined.' });
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to reject swap.' });
        } finally {
            setIsRejectDialogOpen(false);
            setRequestToReject(null);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Header Section */}
                <View className="px-6 pt-8 pb-4">
                    <View className="flex-row justify-between items-start mb-4">
                        <View>
                            <Text className="text-3xl font-bold text-foreground">Hello, {userName}!</Text>
                            <Text className="text-muted-foreground text-lg">Let's squash some bugs today.</Text>
                        </View>
                        <Button variant="outline" size="icon" className="relative" onPress={() => router.push('/notifications')}>
                            <Icon as={BellIcon} className="text-foreground" />
                            {unreadCount > 0 && (
                                <View className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-background z-10" />
                            )}
                        </Button>
                    </View>

                    <View className="flex-row gap-4 mt-2">
                        <TouchableOpacity className="flex-1" onPress={() => router.push('/help' as any)} activeOpacity={0.7}>
                            <Card className="border-border bg-card shadow-sm">
                                <CardContent className="p-3 flex-row items-center gap-3">
                                    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
                                        <Icon as={StarIcon} className="text-primary size-5" />
                                    </View>
                                    <View>
                                        <Text className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reputation</Text>
                                        <Text className="text-xl font-bold text-foreground">{reputation}</Text>
                                    </View>
                                </CardContent>
                            </Card>
                        </TouchableOpacity>
                        <Card className="flex-1 border-border bg-card shadow-sm">
                            <CardContent className="p-3 flex-row items-center gap-3">
                                <View className="h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 dark:bg-orange-500/20">
                                    <Icon as={FlameIcon} className="text-orange-500 size-5" />
                                </View>
                                <View>
                                    <Text className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Streak</Text>
                                    <Text className="text-xl font-bold text-foreground">{streak}</Text>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                </View>

                {/* Attention Needed Section */}
                <View className="px-6 pb-4">
                    <Text className="text-xl font-bold mb-4">⚡ Attention Needed</Text>

                    {dueTasks.length > 0 ? (
                        <ScrollView
                            ref={attentionScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="gap-4"
                        >
                            {dueTasks.map((task) => {
                                let actionBadge = '';
                                if (task.isReviewPending) {
                                    actionBadge = 'Approve';
                                } else if (task.myProofStatus === 'not_uploaded' || task.myProofStatus === 'rejected') {
                                    actionBadge = 'Upload SS';
                                }

                                return (
                                    <View key={task.id} className="w-80 mr-4">
                                        <AppCard
                                            item={{
                                                _id: String(task.id),
                                                title: task.name,
                                                ownerName: task.owner,
                                                dueIn: `Day ${task.day} of ${task.totalDays}`,
                                                day: task.day,
                                                totalDays: task.totalDays,
                                                iconUrl: task.iconUrl,
                                                isReviewPending: task.isReviewPending,
                                                hasUnread: task.hasUnread,
                                            }}
                                            variant="testing"
                                            actionBadge={actionBadge}
                                            onPress={() => router.push({ pathname: '/(tabs)/match/[id]', params: { id: task.id } })}
                                        />
                                    </View>
                                );
                            })}
                        </ScrollView>
                    ) : (
                        <View className="p-6 bg-secondary rounded-xl items-center">
                            <Icon as={CheckCircleIcon} className="text-green-500 mb-2 size-8" />
                            <Text className="font-medium">You're all caught up!</Text>
                        </View>
                    )}
                </View>

                {/* Pending Requests Section */}
                {incomingRequests.length > 0 && (
                    <View className="pb-6">
                        <Text className="text-xl font-bold mb-4 text-primary px-6">Pending Requests</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="pb-2"
                            contentContainerStyle={{ paddingHorizontal: 24 }}
                        >
                            {incomingRequests.map((req) => (
                                <PendingRequestCard
                                    key={req.id}
                                    request={{
                                        _id: req.id,
                                        app1: req.app1 ? { ...req.app1, _id: req.app1.id } : undefined,
                                        app2: req.app2 ? { ...req.app2, _id: req.app2.id } : undefined,
                                    } as any}
                                    onAccept={() => handleAccept(req.id)}
                                    onReject={() => handleReject(req.id)}
                                    onAppPress={(appId) => router.push(`/app-details/${appId}`)}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* My Apps Overview */}
                <View className="px-6 pb-20">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-xl font-bold">My Apps ({myApps.length}/3)</Text>
                        {myApps.length < unlockedSlots && (
                            <TouchableOpacity
                                className="flex-row items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-full"
                                onPress={() => router.push('/add-app')}
                            >
                                <Icon as={PlusIcon} className="text-primary size-4" />
                                <Text className="text-primary font-bold text-xs uppercase">New App</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Show actual apps */}
                    {myApps.map((app) => (
                        <AppCard
                            key={app.id}
                            item={{
                                _id: app.id,
                                title: app.title,
                                iconUrl: app.iconUrl,
                                currentTesters: app.currentTesters,
                                requiredTesters: app.requiredTesters,
                                status: app.status,
                            }}
                            variant="my-app"
                            onPress={() => router.push({ pathname: '/app-details/[id]', params: { id: app.id, source: 'my-app' } } as any)}
                        />
                    ))}

                    {/* Show placeholder cards for empty slots */}
                    {Array.from({ length: Math.max(0, 3 - myApps.length) }).map((_, index) => {
                        const slotNumber = myApps.length + index + 1;
                        const isLocked = slotNumber > unlockedSlots;

                        const handleSlotPress = async () => {
                            if (!isLocked) {
                                router.push('/add-app');
                                return;
                            }

                            toast.info('Unlock Slot', { description: 'Complete 14-day tests to unlock additional app slots!' });
                        };

                        return (
                            <TouchableOpacity
                                key={`placeholder-${index}`}
                                onPress={handleSlotPress}
                                activeOpacity={0.7}
                                disabled={unlocking}
                            >
                                <Card className={`mb-3 p-1.5 flex-row gap-2 border-2 border-dashed ${isLocked ? 'border-orange-400/40 bg-orange-50/10 dark:bg-orange-900/10' : 'border-muted-foreground/20 bg-muted/5'}`}>
                                    <View className={`w-20 h-20 rounded-xl items-center justify-center ${isLocked ? 'bg-orange-500/20' : 'bg-primary/10'}`}>
                                        <Icon as={isLocked ? LockIcon : PlusIcon} className={`size-8 ${isLocked ? 'text-orange-500' : 'text-primary'}`} />
                                    </View>

                                    <View className="flex-1 justify-center py-0.5">
                                        <Text className={`font-semibold text-sm mb-1 ${isLocked ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                                            {isLocked ? 'Locked Slot' : (myApps.length === 0 && index === 0 ? 'Add Your First App' : 'Add Another App')}
                                        </Text>
                                        <Text className="text-muted-foreground/60 text-xs mb-2">
                                            Slot {slotNumber} of 3
                                        </Text>
                                    </View>
                                </Card>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Request</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to reject this swap request? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setIsRejectDialogOpen(false)}>
                            <Text className="font-bold text-foreground">Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction onPress={confirmReject} className="bg-destructive">
                            <Text className="text-white">Reject</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </View>
    );
}
