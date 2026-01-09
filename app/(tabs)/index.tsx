import React, { useState } from 'react';
import { View, ScrollView, RefreshControl, Image, TouchableOpacity, Alert, Platform } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { PendingRequestCard } from '@/components/PendingRequestCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { BellIcon, ActivityIcon, CheckCircleIcon, FlameIcon, StarIcon, PlusIcon, ArrowRightIcon, LockIcon, PlayCircleIcon } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { useInvalidateQueries } from '@/hooks/useInvalidateQueries';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { Id } from '@/convex/_generated/dataModel';
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

export default function HomeScreen() {
    const { user } = useUser();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [requestToReject, setRequestToReject] = useState<Id<"matches"> | null>(null);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

    // Convex Data (with persistent caching)
    const { data: incomingRequests = [] } = useCachedConvexQuery(['incomingRequests'], api.matches.getIncomingRequests);
    const { data: myApps = [] } = useCachedConvexQuery(['myApps'], api.apps.getMyApps);
    const currentUser = useQuery(api.users.getCurrentUser);
    const activeTasks = useQuery(api.matches.getMyActiveTests) || [];
    const unreadCount = useQuery(api.notifications.getUnreadCount) ?? 0;

    // Mutations
    const checkIn = useMutation(api.users.checkIn);
    const acceptSwap = useMutation(api.matches.acceptSwap);
    const rejectSwap = useMutation(api.matches.rejectSwap);
    const unlockAppSlot = useMutation(api.users.unlockAppSlot);

    // Rewarded Ad for unlocking slots
    const { loaded: adLoaded, loading: adLoading, showAd } = useRewardedAd();
    const [unlocking, setUnlocking] = useState(false);

    // Cache invalidation
    const { invalidateMatches, invalidateApps } = useInvalidateQueries();

    // Calculate unlocked slots (default 1)
    const unlockedSlots = currentUser?.unlockedAppSlots ?? 1;

    // Actual user data
    const userName = user?.firstName || "Tester";
    const reputation = currentUser?.reputation ?? 100;
    const streak = currentUser?.streak ?? 0;

    React.useEffect(() => {
        if (currentUser) {
            checkIn();
        }
    }, [currentUser]);

    // Get tasks due today (only those needing attention)
    const dueTasks = activeTasks.filter((t: any) => t.needsAttention).slice(0, 3);

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // Convex queries auto-update, but good for UI feel
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const handleAccept = async (matchId: any) => {
        try {
            await acceptSwap({ matchId });
            // Invalidate caches to show updated data immediately
            invalidateMatches();
            invalidateApps();
            Alert.alert("Success", "Swap accepted! You can now start testing.");
        } catch (error: any) {
            Alert.alert("Error", "Failed to accept swap.");
        }
    };



    const handleReject = (matchId: any) => {
        setRequestToReject(matchId);
        setIsRejectDialogOpen(true);
    };

    const confirmReject = async () => {
        if (!requestToReject) return;
        try {
            await rejectSwap({ matchId: requestToReject });
            // Invalidate caches to remove rejected request immediately
            invalidateMatches();
            // Optional: Toast or success message
        } catch (error: any) {
            Alert.alert("Error", "Failed to reject swap.");
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
                        <TouchableOpacity className="flex-1" onPress={() => router.push('/help')} activeOpacity={0.7}>
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

                {/* Attention Needed Section - FIRST */}
                <View className="px-6 pb-4">
                    <Text className="text-xl font-bold mb-4">⚡ Attention Needed</Text>

                    {dueTasks.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4">
                            {dueTasks.map((task: any) => (
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
                                            hasUnread: task.hasUnread
                                        }}
                                        variant="testing"
                                        onPress={() => router.push({ pathname: '/(tabs)/match/[id]', params: { id: task.id } })}
                                    />
                                </View>
                            ))}
                        </ScrollView>
                    ) : (
                        <View className="p-6 bg-secondary rounded-xl items-center">
                            <Icon as={CheckCircleIcon} className="text-green-500 mb-2 size-8" />
                            <Text className="font-medium">You're all caught up!</Text>
                        </View>
                    )}
                </View>

                {/* Pending Requests Section - SECOND */}
                {
                    incomingRequests.length > 0 && (
                        <View className="pb-6">
                            <Text className="text-xl font-bold mb-4 text-primary px-6">Pending Requests</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                className="pb-2"
                                contentContainerStyle={{ paddingHorizontal: 24 }}
                            >
                                {incomingRequests.map((req: any) => (
                                    <PendingRequestCard
                                        key={req._id}
                                        request={req}
                                        onAccept={handleAccept}
                                        onReject={handleReject}
                                        onAppPress={(appId) => router.push(`/app-details/${appId}`)}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                    )
                }

                {/* My Apps Overview */}
                <View className="px-6 pb-20">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-xl font-bold">My Apps ({myApps.length}/{unlockedSlots})</Text>
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
                            key={app._id}
                            item={app}
                            variant="my-app"
                            onPress={() => router.push({ pathname: "/app-details/[id]", params: { id: app._id, source: 'my-app' } } as any)}
                        />
                    ))}

                    {/* Show placeholder cards for empty slots */}
                    {Array.from({ length: 3 - myApps.length }).map((_, index) => {
                        const slotNumber = myApps.length + index + 1;
                        const isLocked = slotNumber > unlockedSlots;

                        const handleSlotPress = async () => {
                            if (!isLocked) {
                                router.push('/add-app');
                                return;
                            }

                            // Need to unlock via ad
                            if (Platform.OS === 'web') {
                                Alert.alert('Ads Not Available', 'Rewarded ads are only available on mobile devices.');
                                return;
                            }

                            if (!adLoaded) {
                                Alert.alert('Ad Loading', 'Please wait while the ad loads...');
                                return;
                            }

                            setUnlocking(true);
                            try {
                                const rewarded = await showAd();
                                if (rewarded) {
                                    await unlockAppSlot();
                                    Alert.alert('Slot Unlocked!', `App slot ${slotNumber} is now available!`);
                                }
                            } catch (error) {
                                console.error('Failed to unlock slot:', error);
                                Alert.alert('Error', 'Failed to unlock slot. Please try again.');
                            } finally {
                                setUnlocking(false);
                            }
                        };

                        return (
                            <TouchableOpacity
                                key={`placeholder-${index}`}
                                onPress={handleSlotPress}
                                activeOpacity={0.7}
                                disabled={unlocking}
                            >
                                <Card className={`mb-3 p-1.5 flex-row gap-2 border-2 border-dashed ${isLocked ? 'border-orange-400/40 bg-orange-50/10 dark:bg-orange-900/10' : 'border-muted-foreground/20 bg-muted/5'}`}>
                                    {/* Icon placeholder matching image size */}
                                    <View className={`w-20 h-20 rounded-xl items-center justify-center ${isLocked ? 'bg-orange-500/20' : 'bg-primary/10'}`}>
                                        <Icon as={isLocked ? LockIcon : PlusIcon} className={`size-8 ${isLocked ? 'text-orange-500' : 'text-primary'}`} />
                                    </View>

                                    {/* Content matching AppCard layout */}
                                    <View className="flex-1 justify-center py-0.5">
                                        <Text className={`font-semibold text-sm mb-1 ${isLocked ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                                            {isLocked ? 'Locked Slot' : (myApps.length === 0 && index === 0 ? 'Add Your First App' : 'Add Another App')}
                                        </Text>
                                        <Text className="text-muted-foreground/60 text-xs mb-2">
                                            Slot {slotNumber} of 3
                                        </Text>
                                        {isLocked && (
                                            <View className="flex-row items-center gap-1.5 bg-orange-500/10 px-2 py-1 rounded-md self-start">
                                                <Icon as={PlayCircleIcon} className="size-3.5 text-orange-600 dark:text-orange-400" />
                                                <Text className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                                                    {adLoading ? 'Loading...' : 'Watch Ad to Unlock'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </Card>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView >

            <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Request</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to reject this swap request? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setIsRejectDialogOpen(false)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onPress={confirmReject} className="bg-destructive">
                            <Text className="text-white">Reject</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </View >
    );
}
