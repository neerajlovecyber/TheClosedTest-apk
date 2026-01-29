
import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Modal, Pressable, Share, Platform, Linking as RNLinking } from 'react-native';
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
import { toast } from '@/lib/sonner';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as IntentLauncher from 'expo-intent-launcher';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    ArrowLeftIcon,
    StarIcon,
    SmartphoneIcon,
    ExternalLinkIcon,
    ShareIcon,
    CheckCircleIcon,
    XIcon,
    Trash2Icon,
    EditIcon,
    UsersIcon,
    InfoIcon,
    PlayIcon,
    RocketIcon,
    FlagIcon,
    EyeIcon,
    EyeOffIcon,
    WrenchIcon
} from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { Id } from '@/convex/_generated/dataModel';
import { ReportDialog } from '@/components/ReportDialog';

export default function AppDetailsScreen() {
    const { id, source } = useLocalSearchParams();
    const router = useRouter();
    const appId = id as Id<"apps">;

    // Fetch App Details (with caching)
    const { data: app } = useCachedConvexQuery(['appDetails', appId], api.apps.getAppArgs, { appId });

    // Fetch user's own apps to offer
    const myAppsRaw = useQuery(api.apps.getMyApps) || [];
    const myApps = myAppsRaw.filter(a => a.status !== 'completed');

    // Mutation
    const requestSwap = useMutation(api.matches.requestSwap);
    const acceptSwap = useMutation(api.matches.acceptSwap);
    const rejectSwap = useMutation(api.matches.rejectSwap);
    const deleteApp = useMutation(api.apps.deleteApp);
    const markAppAsCompleted = useMutation(api.apps.markAppAsCompleted);
    const verifyAppVisibility = useMutation(api.apps.verifyAppVisibility);
    const markAppFixed = useMutation(api.apps.markAppFixed);
    const user = useQuery(api.users.getCurrentUser);

    // Check Match Status (with caching)
    const { data: matchStatus } = useCachedConvexQuery(['matchStatus', appId], api.matches.getMatchStatus, { appId });

    // Fetch testers (only for owner)
    const { data: testers } = useCachedConvexQuery(['appTesters', appId], api.matches.getAppTesters, { appId });

    const [selectedMyApp, setSelectedMyApp] = useState<Id<"apps"> | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSentRequest, setHasSentRequest] = useState(false);
    const [activeAlert, setActiveAlert] = useState<null | 'no_apps' | 'reject' | 'complete' | 'delete'>(null);
    const [reportDialogVisible, setReportDialogVisible] = useState(false);

    // Initial selection logic
    React.useEffect(() => {
        if (matchStatus?.myAppId) {
            // If match exists, enforce the matched app
            setSelectedMyApp(matchStatus.myAppId);
        } else if (myApps.length === 1 && !selectedMyApp) {
            // Default to sole app if no match
            setSelectedMyApp(myApps[0]._id);
        }
    }, [myApps, matchStatus]);

    const isLocked = matchStatus?.status === 'active' || matchStatus?.status === 'pending';

    const handleOpenApp = async () => {
        if (!app) return;
        const packageName = app.packageName;
        const marketUrl = `market://details?id=${packageName}`;
        const webUrl = app.playStoreUrl || `https://play.google.com/store/apps/details?id=${packageName}`;

        const openPlayStore = () => {
            RNLinking.canOpenURL(marketUrl).then(supported => {
                if (supported) {
                    RNLinking.openURL(marketUrl);
                } else {
                    RNLinking.openURL(webUrl);
                }
            }).catch(() => {
                RNLinking.openURL(webUrl);
            });
        };

        if (Platform.OS === 'android') {
            try {
                // @ts-ignore - openApplication is available in expo-intent-launcher ~13.0.0
                await IntentLauncher.openApplication(packageName);
            } catch (error: any) {

                openPlayStore();
            }
        } else {
            openPlayStore();
        }
    };

    const handleRequestSwap = async () => {
        if (!selectedMyApp) {
            if (myApps.length === 0) {
                setActiveAlert('no_apps');
                return;
            }
            setIsModalVisible(true);
            return;
        }

        const selectedApp = myApps.find((a: any) => a._id === selectedMyApp);
        if (selectedApp && (selectedApp.currentTesters >= selectedApp.requiredTesters || selectedApp.status === 'filled')) {
            toast.error('App Full', { description: 'Your selected app already has enough testers.' });
            return;
        }

        try {
            setIsSubmitting(true);
            await requestSwap({
                targetAppId: appId,
                myAppId: selectedMyApp,
                message: "I'd like to test your app!"
            });
            toast.success('Sent!', { description: 'Swap request sent.' });
            setHasSentRequest(true); // Optimistic update
        } catch (error: any) {
            toast.error('Error', { description: error.message || "Failed to send request" });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Visibility Verification
    const handleVoteVisibility = async (isVisible: boolean) => {
        try {
            await verifyAppVisibility({ appId, isVisible });
            toast.success("Thanks!", { description: "Your feedback helps improve the marketplace." });
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        }
    };

    const handleMarkFixed = async () => {
        try {
            setIsSubmitting(true);
            await markAppFixed({ appId });
            toast.success("Status Reset", { description: "App is now marked as unverified." });
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!matchStatus?.matchId) return;
        try {
            setIsSubmitting(true);
            await acceptSwap({ matchId: matchStatus.matchId });
            toast.success('Accepted!', { description: 'Swap accepted! You can now start testing.' });
        } catch (error: any) {
            toast.error('Error', { description: 'Failed to accept swap.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRejectRequest = async () => {
        if (!matchStatus?.matchId) return;
        setActiveAlert('reject');
    };

    const handleConfirmAction = async () => {
        const type = activeAlert;
        setActiveAlert(null); // Close dialog

        if (type === 'no_apps') {
            router.push('/add-app');
            return;
        }

        if (type === 'reject') {
            if (!matchStatus?.matchId) return;
            try {
                setIsSubmitting(true);
                await rejectSwap({ matchId: matchStatus.matchId });
                toast.success('Rejected');
            } catch (error: any) {
                toast.error('Error', { description: 'Failed to reject swap.' });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!app) return;

        if (type === 'complete') {
            try {
                setIsSubmitting(true);
                const result = await markAppAsCompleted({ appId: app._id });
                toast.success("Congratulations!", {
                    description: `${app.title} marked as completed!\n\n+20 reputation earned!\n${result.archivedMatches > 0 ? `${result.archivedMatches} active match(es) completed.` : ''}`
                });
            } catch (err: any) {
                toast.error("Error", { description: err.message || "Failed to mark as completed" });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (type === 'delete') {
            try {
                setIsSubmitting(true);
                // Delete image from R2 first
                try {
                    const { deleteImageFromR2 } = require('@/utils/image-uploader');
                    await deleteImageFromR2(`app-icons/${appId}.webp`);
                } catch (imgError) {
                    console.warn("Failed to delete image", imgError);
                }

                await deleteApp({ appId: app._id });
                router.replace("/(tabs)/" as any);
            } catch (err: any) {
                toast.error("Error", { description: err.message });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }
    };

    if (!app) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text>Loading app details...</Text>
            </SafeAreaView>
        );
    }

    const selectedAppData = myApps.find((a: any) => a._id === selectedMyApp);

    const handleShare = async () => {
        try {
            // Hardcoded as requested
            const convexSiteUrl = "https://artful-grasshopper-509.convex.site";
            const shareUrl = `${convexSiteUrl}/share?appId=${appId}`;

            await Share.share({
                message: `Help me test "${app.title}" on TheClosedTest! Open this link to view details and request a swap: ${shareUrl}`,
                title: `Test ${app.title}`,
                url: shareUrl,
            });
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center px-4 py-3 border-b border-border justify-between">
                <View className="flex-row items-center">
                    <Button variant="ghost" size="icon" onPress={() => router.back()}>
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </Button>
                    <Text className="text-lg font-bold ml-2">App Details</Text>
                </View>
                <View className="flex-row items-center gap-2">
                    <Button variant="ghost" size="icon" onPress={() => setReportDialogVisible(true)}>
                        <Icon as={FlagIcon} className="text-red-600 size-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onPress={handleShare}>
                        <Icon as={ShareIcon} className="text-foreground size-5" />
                    </Button>
                </View>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Critical Warning for Owner */}
                {app.isMine && app.visibility?.status === 'hidden' && (
                    <View className="px-4 py-2 mt-2">
                        <Card className="border-red-500 bg-red-50 dark:bg-red-900/10">
                            <CardContent className="p-4 gap-3">
                                <View className="flex-row items-center gap-2">
                                    <Icon as={EyeOffIcon} className="size-5 text-red-600 dark:text-red-400" />
                                    <Text className="font-bold text-red-700 dark:text-red-400 text-base">
                                        App Reported Not Visible!
                                    </Text>
                                </View>

                                <Text className="text-red-600/80 dark:text-red-300/80 text-sm leading-normal">
                                    Testers are unable to find your app on the Play Store. Ensure you have added the correct Google Group link and that your app is published.
                                </Text>

                                <TouchableOpacity
                                    onPress={() => Linking.openURL('https://theclosedtest.neerajlovecyber.com/playstore-guide')}
                                >
                                    <Text className="underline font-bold text-red-700 dark:text-red-400">View Setup Guide</Text>
                                </TouchableOpacity>

                                <Button
                                    size="sm"
                                    className="mt-2 bg-red-600"
                                    onPress={handleMarkFixed}
                                    disabled={isSubmitting}
                                >
                                    <Icon as={WrenchIcon} className="size-4 text-white mr-2" />
                                    <Text className="text-white font-bold">I have fixed this</Text>
                                </Button>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Verification Card for Visitors */}
                {!app.isMine && (!app.visibility || app.visibility.status !== 'visible') && user && (!app.visibility?.voters?.includes(user._id)) && (
                    <View className="px-4 py-2 mt-2">
                        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
                            <CardContent className="p-4 gap-3">
                                <View className="flex-row items-center gap-2">
                                    <Icon as={EyeIcon} className="size-5 text-orange-600 dark:text-orange-400" />
                                    <Text className="font-bold text-orange-700 dark:text-orange-400 text-base">
                                        Can you see this app?
                                    </Text>
                                </View>
                                <Text className="text-orange-600/80 dark:text-orange-300/80 text-sm">
                                    Please help us verify if this app is visible on the Play Store.
                                </Text>
                                <View className="flex-row gap-3">
                                    <Button
                                        size="sm"
                                        className="flex-1 bg-orange-600 dark:bg-orange-600 border-0 shadow-sm"
                                        onPress={() => handleVoteVisibility(true)}
                                    >
                                        <Text className="text-white font-bold">Yes, it opens</Text>
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1"
                                        onPress={() => handleVoteVisibility(false)}
                                    >
                                        <Text className="text-foreground font-medium">No, error</Text>
                                    </Button>
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* App Header Card */}
                <View className="px-4 py-4 mb-2">
                    <Card className="border-0 overflow-hidden bg-blue-950 shadow-lg">
                        <CardContent className="p-0">
                            {/* Main App Info */}
                            <View className="p-5 flex-row items-start gap-4">
                                <Image
                                    source={{ uri: app.iconUrl || 'https://github.com/shadcn.png' }}
                                    className="w-20 h-20 rounded-2xl bg-background"
                                />
                                <View className="flex-1 gap-1">
                                    <View>
                                        <Text className="text-2xl font-bold text-white leading-tight" numberOfLines={2}>
                                            {app.title}
                                        </Text>
                                        <Text className="text-blue-100 text-sm" numberOfLines={1}>{app.packageName}</Text>
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleOpenApp}
                                        className="flex-row items-center bg-white px-3 py-1.5 rounded-full self-start mt-2"
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Icon as={PlayIcon} className="size-3.5 text-black mr-1.5" />
                                        <Text className="text-black font-bold text-xs">Open App</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Integrated Footer for Owner */}
                            <View className="px-5 py-4 flex-row items-center justify-between border-t border-white/10">
                                <Text className="text-xs font-semibold text-blue-100 uppercase tracking-widest">
                                    Published by
                                </Text>
                                <Text className="text-sm font-bold text-white">
                                    {app.ownerName || "Unknown"}
                                </Text>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                {/* Progress Section */}
                {app.status !== 'completed' && (
                    <View className="px-4 mb-6 gap-3">

                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-5 gap-3">
                                <View className="flex-row justify-between items-center">
                                    <Text className="font-semibold text-foreground">Progress</Text>
                                    <Text className="font-bold text-primary">{app.currentTesters || 0} / {app.requiredTesters} testers</Text>
                                </View>
                                <View className="h-3 bg-secondary rounded-full overflow-hidden w-full">
                                    <View
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${Math.min(100, ((app.currentTesters || 0) / app.requiredTesters) * 100)}%` }}
                                    />
                                </View>

                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Instructions Section */}
                <View className="px-4 mb-6 gap-3">
                    <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Instructions</Text>
                    <Card className="border-0 overflow-hidden">
                        <CardContent className="p-5">
                            <View className="flex-row gap-3">
                                <View className="mt-1">
                                    <Icon as={InfoIcon} className="size-5 text-blue-500" />
                                </View>
                                <Text className="text-foreground leading-relaxed flex-1 text-base">
                                    {app.instructions || "No specific testing instructions provided by the developer."}
                                </Text>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                {/* My App to Offer (Only for non-owners) */}
                {!app.isMine && (
                    <View className="px-4 mb-6 gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Your Offer</Text>
                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-0">
                                {selectedAppData ? (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        disabled={isLocked}
                                        onPress={() => setIsModalVisible(true)}
                                        className={`p-4 flex-row items-center gap-4 ${isLocked ? 'opacity-80' : ''}`}
                                    >
                                        <Image
                                            source={{ uri: selectedAppData.iconUrl || 'https://github.com/shadcn.png' }}
                                            className="w-12 h-12 rounded-xl bg-muted"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-bold text-base text-foreground">{selectedAppData.title}</Text>
                                            <Text className={`text-xs ${selectedAppData.currentTesters >= selectedAppData.requiredTesters || selectedAppData.status === 'filled' ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                                                {isLocked ? (matchStatus?.status === 'active' ? 'Active Match (Locked)' : 'Request Sent (Locked)') : (selectedAppData.currentTesters >= selectedAppData.requiredTesters || selectedAppData.status === 'filled' ? '⚠️ App is full - Select another' : 'Tap to change app')}
                                            </Text>
                                        </View>
                                        {isLocked ? (
                                            <View className="bg-secondary/50 p-1.5 rounded-full">
                                                <Icon as={CheckCircleIcon} className="text-muted-foreground size-5" />
                                            </View>
                                        ) : (
                                            <Icon as={CheckCircleIcon} className="text-green-500 size-6" />
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setIsModalVisible(true)}
                                        className="p-6 items-center justify-center bg-secondary/20"
                                    >
                                        <View className="h-12 w-12 rounded-full bg-primary/10 items-center justify-center mb-2">
                                            <Icon as={SmartphoneIcon} className="text-primary size-6" />
                                        </View>
                                        <Text className="font-semibold text-foreground">Select an App to Offer</Text>
                                        <Text className="text-xs text-muted-foreground text-center mt-1">
                                            You need to offer one of your apps for mutual testing
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Testers Section (Owner Only) */}
                {app.isMine && app.status !== 'completed' && (
                    <View className="px-4 mb-6 gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">
                            Active Testers ({testers?.length || 0})
                        </Text>
                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-0 divide-y divide-border/50">
                                {testers && testers.length > 0 ? (
                                    testers.map((tester: any) => (
                                        <View
                                            key={tester.matchId}
                                            className="flex-row items-center gap-4 p-4"
                                        >
                                            {tester.testerAvatar && !tester.testerAvatar.includes('shadcn.png') ? (
                                                <Image
                                                    source={{ uri: tester.testerAvatar }}
                                                    className="size-10 rounded-full bg-muted"
                                                />
                                            ) : (
                                                <View className="size-10 rounded-full bg-primary/10 items-center justify-center">
                                                    <Text className="text-sm font-bold text-primary">
                                                        {tester.testerName?.substring(0, 2).toUpperCase() || "??"}
                                                    </Text>
                                                </View>
                                            )}
                                            <View className="flex-1">
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="font-bold text-foreground">{tester.testerName}</Text>
                                                    {tester.hasUnread && (
                                                        <View className="bg-red-500 w-2 h-2 rounded-full" />
                                                    )}
                                                </View>
                                                <Text className="text-xs text-muted-foreground">Day {tester.day} of 14</Text>
                                                {tester.testerEmail && (
                                                    <TouchableOpacity onPress={() => Share.share({ message: tester.testerEmail || "" })}>
                                                        <Text className="text-xs text-blue-500 mt-0.5">{tester.testerEmail}</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            <View className="items-end gap-2">
                                                {tester.uploadedToday ? (
                                                    <View className="bg-green-500/10 px-2 py-1 rounded-md">
                                                        <Text className="text-[10px] font-bold text-green-600 dark:text-green-400">UPLOADED</Text>
                                                    </View>
                                                ) : (
                                                    <View className="bg-orange-500/10 px-2 py-1 rounded-md">
                                                        <Text className="text-[10px] font-bold text-orange-600 dark:text-orange-400">PENDING</Text>
                                                    </View>
                                                )}

                                                <TouchableOpacity
                                                    onPress={() => router.push({ pathname: "/(tabs)/match/[id]", params: { id: tester.matchId } } as any)}
                                                    className="flex-row items-center"
                                                >
                                                    <Text className="text-xs text-primary font-medium mr-1">Details</Text>
                                                    <Icon as={ArrowLeftIcon} className="size-3 text-primary rotate-180" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    <View className="items-center py-12 px-6">
                                        <View className="h-16 w-16 rounded-full bg-muted items-center justify-center mb-4">
                                            <Icon as={UsersIcon} className="size-8 text-muted-foreground/50" />
                                        </View>
                                        <Text className="text-muted-foreground text-center font-medium">No active testers yet</Text>
                                        <Text className="text-muted-foreground/60 text-center text-sm mt-1">Share your app to start getting testers!</Text>
                                    </View>
                                )}
                            </CardContent>
                        </Card>
                    </View>
                )}
            </ScrollView>

            {/* Action Button */}
            <View className="p-4 border-t border-border bg-background safe-bottom">
                {app.isMine ? (
                    <>
                        {/* Check if app is at least 7 days old for completion */}
                        {(() => {
                            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
                            const appAgeMs = app.createdAt ? Date.now() - app.createdAt : 0;
                            const isOldEnough = appAgeMs >= sevenDaysMs;
                            const isCompleted = app.status === 'completed';
                            const daysRemaining = Math.ceil((sevenDaysMs - appAgeMs) / (24 * 60 * 60 * 1000));

                            if (isCompleted) {
                                return (
                                    <View className="w-full py-3 items-center justify-center bg-green-100 dark:bg-green-900/30 rounded-xl mb-3">
                                        <View className="flex-row items-center gap-2">
                                            <Icon as={RocketIcon} className="size-5 text-green-600 dark:text-green-400" />
                                            <Text className="text-green-600 dark:text-green-400 font-bold">Launched to Production! 🎉</Text>
                                        </View>
                                    </View>
                                );
                            }

                            if (isOldEnough) {
                                return (
                                    <Button
                                        size="lg"
                                        variant="outline"
                                        onPress={() => setActiveAlert('complete')}
                                        className="w-full rounded-xl border-green-500 bg-green-500/10 mb-3"
                                        disabled={isSubmitting}
                                    >
                                        <Icon as={RocketIcon} className="size-4 text-green-600 dark:text-green-400 mr-2" />
                                        <Text className="font-bold text-green-600 dark:text-green-400">Got Production Access! 🚀</Text>
                                    </Button>
                                );
                            }

                            // Show disabled/greyed out button for apps less than 7 days old
                            return (
                                <View className="w-full rounded-xl border border-muted-foreground/30 bg-muted/20 mb-3 py-3 px-4">
                                    <View className="flex-row items-center justify-center gap-2 mb-1">
                                        <Icon as={RocketIcon} className="size-4 text-muted-foreground/50" />
                                        <Text className="font-bold text-muted-foreground/50">Got Production Access?</Text>
                                    </View>
                                    <Text className="text-xs text-muted-foreground/60 text-center">
                                        Available in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                                    </Text>
                                </View>
                            );
                        })()}
                        <View className="flex-row gap-4">
                            <Button
                                size="lg"
                                onPress={() => router.push({ pathname: "/edit-app", params: { id: app._id } })}
                                className="flex-1 rounded-2xl shadow-sm"
                                disabled={isSubmitting}
                            >
                                <Icon as={EditIcon} className="size-4 text-white mr-2" />
                                <Text className="font-bold text-white">Edit Details</Text>
                            </Button>
                            <Button
                                size="lg"
                                variant="destructive"
                                onPress={() => setActiveAlert('delete')}
                                className="flex-1 rounded-2xl shadow-sm"
                                disabled={isSubmitting}
                            >
                                <Icon as={Trash2Icon} className="size-4 text-white mr-2" />
                                <Text className="font-bold text-white">Delete</Text>
                            </Button>
                        </View>
                    </>
                ) : (
                    // Logic for Visitor (Not Owner)
                    matchStatus?.status === 'active' ? (
                        <Button
                            size="lg"
                            className="w-full rounded-xl bg-green-600"
                            onPress={() => router.push({ pathname: "/(tabs)/match/[id]", params: { id: matchStatus.matchId } } as any)}
                        >
                            <Text className="font-bold text-lg text-white">Active Swap - Go to Details</Text>
                        </Button>
                    ) : matchStatus?.status === 'pending' || hasSentRequest ? (
                        matchStatus?.isRequestor || hasSentRequest ? (
                            <Button
                                size="lg"
                                variant="outline"
                                className="w-full rounded-xl opacity-80"
                                disabled={true}
                            >
                                <Text className="font-bold text-lg">Request Sent</Text>
                            </Button>
                        ) : (
                            <View className="flex-row gap-3">
                                <Button
                                    size="lg"
                                    variant="destructive"
                                    className="flex-1 rounded-xl shadow-sm"
                                    onPress={handleRejectRequest}
                                    disabled={isSubmitting}
                                >
                                    <Text className="font-bold text-white">Decline</Text>
                                </Button>
                                <Button
                                    size="lg"
                                    className="flex-1 rounded-xl shadow-sm"
                                    onPress={handleAcceptRequest}
                                    disabled={isSubmitting}
                                >
                                    <Text className="font-bold text-primary-foreground">Accept</Text>
                                </Button>
                            </View>
                        )
                    ) : matchStatus?.status === 'completed' ? (
                        <View className="w-full py-4 items-center justify-center bg-green-100 dark:bg-green-900/30 rounded-xl">
                            <View className="flex-row items-center gap-2">
                                <Icon as={RocketIcon} className="size-5 text-green-600 dark:text-green-400" />
                                <Text className="text-green-600 dark:text-green-400 font-bold text-lg">Launched in Production!</Text>
                            </View>
                            <Text className="text-xs text-center text-muted-foreground mt-1">You completed testing for this app.</Text>
                        </View>
                    ) : (
                        // No Match -> Show Request Button or Filled status
                        app.status === 'completed' ? (
                            <View className="w-full py-4 items-center justify-center bg-green-100 dark:bg-green-900/30 rounded-xl">
                                <View className="flex-row items-center gap-2">
                                    <Icon as={RocketIcon} className="size-5 text-green-600 dark:text-green-400" />
                                    <Text className="text-green-600 dark:text-green-400 font-bold text-lg">Launched in Production!</Text>
                                </View>
                            </View>
                        ) : app.isFilled ? (
                            <View className="w-full py-4 items-center justify-center bg-red-100 dark:bg-red-900/30 rounded-xl">
                                <Text className="text-red-600 dark:text-red-400 font-bold text-lg">Filled - Not Accepting Requests</Text>
                            </View>
                        ) : (
                            <Button
                                size="lg"
                                onPress={handleRequestSwap}
                                className="w-full rounded-xl"
                                disabled={isSubmitting || (!!selectedAppData && (selectedAppData.currentTesters >= selectedAppData.requiredTesters || selectedAppData.status === 'filled'))}
                            >
                                <Text className="font-bold text-lg">
                                    {isSubmitting ? 'Sending Request...' : (selectedAppData && (selectedAppData.currentTesters >= selectedAppData.requiredTesters || selectedAppData.status === 'filled') ? 'App Full' : 'Request Swap')}
                                </Text>
                            </Button>
                        )
                    )
                )}
            </View>

            {/* App Selection Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setIsModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[50%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold">Select App</Text>
                            <Button variant="ghost" size="icon" onPress={() => setIsModalVisible(false)}>
                                <Icon as={XIcon} className="size-6" />
                            </Button>
                        </View>

                        {myApps.length === 0 ? (
                            <View className="items-center py-10 gap-4">
                                <Text className="text-muted-foreground text-center">You haven't added any apps yet.</Text>
                                <Button onPress={() => { setIsModalVisible(false); router.push('/add-app'); }}>
                                    <Text>Add New App</Text>
                                </Button>
                            </View>
                        ) : (
                            <ScrollView>
                                {myApps.map((myapp: any) => {
                                    const isFull = myapp.currentTesters >= myapp.requiredTesters || myapp.status === 'filled';
                                    return (
                                        <TouchableOpacity
                                            key={myapp._id}
                                            className={`flex-row items-center gap-4 p-4 mb-3 rounded-xl border ${selectedMyApp === myapp._id ? 'border-primary bg-primary/5' : 'border-border'} ${isFull ? 'opacity-60' : ''}`}
                                            onPress={() => {
                                                setSelectedMyApp(myapp._id);
                                                setIsModalVisible(false);
                                            }}
                                        >
                                            <Image
                                                source={{ uri: myapp.iconUrl || 'https://github.com/shadcn.png' }}
                                                className="w-12 h-12 rounded-lg bg-muted"
                                            />
                                            <View className="flex-1">
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="font-bold text-lg">{myapp.title}</Text>
                                                    {isFull && (
                                                        <View className="bg-red-500/10 px-2 py-0.5 rounded-full">
                                                            <Text className="text-[10px] font-bold text-red-600 uppercase">FULL</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text className="text-muted-foreground text-sm">{myapp.currentTesters} / {myapp.requiredTesters} testers</Text>
                                            </View>
                                            {selectedMyApp === myapp._id && (
                                                <Icon as={CheckCircleIcon} className="text-primary size-5" />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <ReportDialog
                visible={reportDialogVisible}
                onClose={() => setReportDialogVisible(false)}
                reportType="app"
                targetId={appId}
                reportedAppId={appId}
                targetName={app.title}
            />

            {/* Shared Alert Dialog */}
            <AlertDialog open={!!activeAlert} onOpenChange={(open) => !open && setActiveAlert(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {activeAlert === 'no_apps' && "No Apps Found"}
                            {activeAlert === 'reject' && "Reject Request"}
                            {activeAlert === 'complete' && "🚀 Mark as Completed?"}
                            {activeAlert === 'delete' && "Delete App"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {activeAlert === 'no_apps' && "You need to add an app first to request a swap."}
                            {activeAlert === 'reject' && "Are you sure you want to reject this request?"}
                            {activeAlert === 'complete' && "Congratulations on getting production access!\n\nThis will:\n• Give you +20 reputation\n• Complete all active matches\n• Remove pending swap requests\n\nThis action cannot be undone."}
                            {activeAlert === 'delete' && "Are you sure? This will permanently remove your app and all associated test records. This cannot be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setActiveAlert(null)}>
                            <Text className="font-bold text-foreground">Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onPress={handleConfirmAction}
                            className={activeAlert === 'reject' || activeAlert === 'delete' ? "bg-destructive" : ""}
                        >
                            <Text className={activeAlert === 'reject' || activeAlert === 'delete' ? "text-white font-bold" : "font-bold"}>
                                {activeAlert === 'no_apps' ? "Add App" : (activeAlert === 'reject' ? "Reject" : (activeAlert === 'delete' ? "Delete" : "Confirm"))}
                            </Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SafeAreaView>
    );
}
