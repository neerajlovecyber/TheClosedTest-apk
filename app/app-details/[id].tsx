
import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Alert, Modal, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
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
    PlayIcon
} from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';
import { Id } from '@/convex/_generated/dataModel';

export default function AppDetailsScreen() {
    const { id, source } = useLocalSearchParams();
    const router = useRouter();
    const appId = id as Id<"apps">;

    // Fetch App Details (with caching)
    const { data: app } = useCachedConvexQuery(['appDetails', appId], api.apps.getAppArgs, { appId });

    // Fetch user's own apps to offer
    const myApps = useQuery(api.apps.getMyApps) || [];

    // Mutation
    // Mutation
    const requestSwap = useMutation(api.matches.requestSwap);
    const acceptSwap = useMutation(api.matches.acceptSwap);
    const rejectSwap = useMutation(api.matches.rejectSwap);
    const deleteApp = useMutation(api.apps.deleteApp);

    // Check Match Status (with caching)
    const { data: matchStatus } = useCachedConvexQuery(['matchStatus', appId], api.matches.getMatchStatus, { appId });

    // Fetch testers (only for owner)
    const testers = useQuery(api.matches.getAppTesters, { appId });

    const [selectedMyApp, setSelectedMyApp] = useState<Id<"apps"> | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSentRequest, setHasSentRequest] = useState(false);

    // Initial selection if user has only one recruitng app
    React.useEffect(() => {
        if (myApps.length === 1 && !selectedMyApp) {
            setSelectedMyApp(myApps[0]._id);
        }
    }, [myApps]);

    const handleOpenPlayStore = async () => {
        if (!app) return;
        const playUrl = app.playStoreUrl;
        const marketUrl = `market://details?id=${app.packageName}`;

        try {
            // Try market scheme first (deep link to Play Store app)
            await Linking.openURL(marketUrl);
        } catch (error) {
            // Fallback to web URL
            if (playUrl) {
                Linking.openURL(playUrl).catch(() => {
                    Alert.alert("Error", "Could not open Play Store. Please ensure you have it installed.");
                });
            } else {
                Alert.alert("Error", "Play Store link not found.");
            }
        }
    };

    const handleRequestSwap = async () => {
        if (!selectedMyApp) {
            if (myApps.length === 0) {
                Alert.alert("No Apps Found", "You need to add an app first to request a swap.", [
                    { text: "Add App", onPress: () => router.push('/add-app') },
                    { text: "Cancel", style: "cancel" }
                ]);
                return;
            }
            setIsModalVisible(true);
            return;
        }

        try {
            setIsSubmitting(true);
            await requestSwap({
                targetAppId: appId,
                myAppId: selectedMyApp,
                message: "I'd like to test your app!"
            });
            Alert.alert("Success", "Swap request sent! Wait for the owner to accept.");
            setHasSentRequest(true); // Optimistic update
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to send request");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!matchStatus?.matchId) return;
        try {
            setIsSubmitting(true);
            await acceptSwap({ matchId: matchStatus.matchId });
            Alert.alert("Success", "Swap accepted! You can now start testing.");
        } catch (error: any) {
            Alert.alert("Error", "Failed to accept swap.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRejectRequest = async () => {
        if (!matchStatus?.matchId) return;
        Alert.alert(
            "Reject Request",
            "Are you sure you want to reject this request?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Reject",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setIsSubmitting(true);
                            await rejectSwap({ matchId: matchStatus.matchId });
                        } catch (error: any) {
                            Alert.alert("Error", "Failed to reject swap.");
                        } finally {
                            setIsSubmitting(false);
                        }
                    }
                }
            ]
        );
    };

    if (!app) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text>Loading app details...</Text>
            </SafeAreaView>
        );
    }

    const selectedAppData = myApps.find(a => a._id === selectedMyApp);

    const handleShare = async () => {
        try {
            const deepLink = Linking.createURL(`/app-details/${appId}`);
            await Share.share({
                message: `Help me test "${app.title}" on TheClosedTest! Open this link to view details and request a swap: ${deepLink}`,
                title: `Test ${app.title}`,
                url: deepLink, // iOS support
            });
        } catch (error: any) {
            Alert.alert(error.message);
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
                <Button variant="ghost" size="icon" onPress={handleShare}>
                    <Icon as={ShareIcon} className="text-foreground size-5" />
                </Button>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
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
                                        onPress={handleOpenPlayStore}
                                        className="flex-row items-center bg-white px-3 py-1.5 rounded-full self-start mt-2"
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Icon as={PlayIcon} className="size-3.5 text-black mr-1.5" />
                                        <Text className="text-black font-bold text-xs">Play Store</Text>
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
                                        onPress={() => setIsModalVisible(true)}
                                        className="p-4 flex-row items-center gap-4"
                                    >
                                        <Image
                                            source={{ uri: selectedAppData.iconUrl || 'https://github.com/shadcn.png' }}
                                            className="w-12 h-12 rounded-xl bg-muted"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-bold text-base text-foreground">{selectedAppData.title}</Text>
                                            <Text className="text-xs text-muted-foreground">Tap to change app</Text>
                                        </View>
                                        <Icon as={CheckCircleIcon} className="text-green-500 size-6" />
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
                {app.isMine && (
                    <View className="px-4 mb-20 gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">
                            Active Testers ({testers?.length || 0})
                        </Text>
                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-0 divide-y divide-border/50">
                                {testers && testers.length > 0 ? (
                                    testers.map((tester) => (
                                        <View
                                            key={tester.matchId}
                                            className="flex-row items-center gap-4 p-4"
                                        >
                                            <Image
                                                source={{ uri: tester.testerAvatar }}
                                                className="size-10 rounded-full bg-muted"
                                            />
                                            <View className="flex-1">
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="font-bold text-foreground">{tester.testerName}</Text>
                                                    {tester.hasUnread && (
                                                        <View className="bg-red-500 w-2 h-2 rounded-full" />
                                                    )}
                                                </View>
                                                <Text className="text-xs text-muted-foreground">Day {tester.day} of 14</Text>
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
                    source === 'marketplace' ? (
                        <View className="w-full py-3 items-center justify-center bg-secondary/30 rounded-xl">
                            <Text className="text-muted-foreground font-semibold">Your App Listing</Text>
                        </View>
                    ) : (
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
                                onPress={() => {
                                    Alert.alert(
                                        "Delete App",
                                        "Are you sure? This will permanently remove your app and all associated test records. This cannot be undone.",
                                        [
                                            { text: "Cancel", style: "cancel" },
                                            {
                                                text: "Delete",
                                                style: "destructive",
                                                onPress: async () => {
                                                    try {
                                                        setIsSubmitting(true);

                                                        // Delete image from R2 first
                                                        try {
                                                            const { deleteImageFromR2 } = require('@/utils/image-uploader');
                                                            await deleteImageFromR2(`app-icons/${appId}.webp`);
                                                        } catch (imgError) {
                                                            console.warn("Failed to delete image", imgError);
                                                            // Proceed anyway to delete app
                                                        }

                                                        await deleteApp({ appId: app._id });
                                                        router.replace("/(tabs)/" as any);
                                                    } catch (err: any) {
                                                        Alert.alert("Error", err.message);
                                                    } finally {
                                                        setIsSubmitting(false);
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                }}
                                className="flex-1 rounded-2xl shadow-sm"
                                disabled={isSubmitting}
                            >
                                <Icon as={Trash2Icon} className="size-4 text-white mr-2" />
                                <Text className="font-bold text-white">Delete</Text>
                            </Button>
                        </View>
                    )
                ) : (
                    // Logic for Visitor (Not Owner)
                    matchStatus?.status === 'active' ? (
                        <Button
                            size="lg"
                            className="w-full rounded-xl bg-green-600"
                            onPress={() => router.push('/(tabs)/tests')} // Or dashboard
                        >
                            <Text className="font-bold text-lg text-white">Active Swap - Go to Tests</Text>
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
                                    variant="outline"
                                    className="flex-1 rounded-xl border-destructive/50"
                                    onPress={handleRejectRequest}
                                    disabled={isSubmitting}
                                >
                                    <Text className="font-bold text-destructive">Decline</Text>
                                </Button>
                                <Button
                                    size="lg"
                                    className="flex-1 rounded-xl bg-green-600"
                                    onPress={handleAcceptRequest}
                                    disabled={isSubmitting}
                                >
                                    <Text className="font-bold text-white">Accept</Text>
                                </Button>
                            </View>
                        )
                    ) : (
                        // No Match -> Show Request Button or Filled status
                        app.isFilled ? (
                            <View className="w-full py-4 items-center justify-center bg-red-100 dark:bg-red-900/30 rounded-xl">
                                <Text className="text-red-600 dark:text-red-400 font-bold text-lg">Filled - Not Accepting Requests</Text>
                            </View>
                        ) : (
                            <Button
                                size="lg"
                                onPress={handleRequestSwap}
                                className="w-full rounded-xl"
                                disabled={isSubmitting}
                            >
                                <Text className="font-bold text-lg">{isSubmitting ? 'Sending Request...' : 'Request Swap'}</Text>
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
                                {myApps.map(myapp => (
                                    <TouchableOpacity
                                        key={myapp._id}
                                        className={`flex-row items-center gap-4 p-4 mb-3 rounded-xl border ${selectedMyApp === myapp._id ? 'border-primary bg-primary/5' : 'border-border'}`}
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
                                            <Text className="font-bold text-lg">{myapp.title}</Text>
                                            <Text className="text-muted-foreground text-sm">{myapp.currentTesters} / {myapp.requiredTesters} testers</Text>
                                        </View>
                                        {selectedMyApp === myapp._id && (
                                            <Icon as={CheckCircleIcon} className="text-primary size-5" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView >
    );
}
