
import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Alert, Modal, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, StarIcon, SmartphoneIcon, ExternalLinkIcon, ShareIcon, CheckCircleIcon, XIcon, Trash2Icon, EditIcon, UsersIcon } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

export default function AppDetailsScreen() {
    const { id, source } = useLocalSearchParams();
    const router = useRouter();
    const appId = id as Id<"apps">;

    // Fetch App Details
    const app = useQuery(api.apps.getAppArgs, { appId });

    // Fetch user's own apps to offer
    const myApps = useQuery(api.apps.getMyApps) || [];

    // Mutation
    // Mutation
    const requestSwap = useMutation(api.matches.requestSwap);
    const acceptSwap = useMutation(api.matches.acceptSwap);
    const rejectSwap = useMutation(api.matches.rejectSwap);
    const deleteApp = useMutation(api.apps.deleteApp);

    // Check Match Status
    const matchStatus = useQuery(api.matches.getMatchStatus, { appId });

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

            <ScrollView className="flex-1 px-6 pt-6">
                {/* Header Section */}
                <View className="flex-row items-center gap-4 mb-4">
                    <Image
                        source={{ uri: app.iconUrl || 'https://github.com/shadcn.png' }}
                        className="w-16 h-16 rounded-xl bg-muted border border-border"
                    />
                    <View className="flex-1">
                        <Text className="text-2xl font-bold" numberOfLines={1}>{app.title}</Text>
                        <Text className="text-muted-foreground mb-2">{app.packageName}</Text>
                        <TouchableOpacity
                            onPress={handleOpenPlayStore}
                            className="flex-row items-center bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-full self-start"
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Icon as={ExternalLinkIcon} className="size-3.5 text-green-700 dark:text-green-400 mr-1.5" />
                            <Text className="text-green-700 dark:text-green-400 font-bold text-xs">Open in Play Store</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Testing Instructions */}
                <View className="mb-4">
                    <Text className="font-bold text-lg mb-2">Testing Instructions</Text>
                    <View className="bg-secondary/30 p-4 rounded-xl">
                        <Text className="text-foreground leading-relaxed">
                            {app.instructions || "No specific instructions provided."}
                        </Text>
                    </View>
                </View>

                <View className="flex-row justify-between items-center mb-4">
                    <Text className="font-medium text-lg text-muted-foreground">App Owner</Text>
                    <View className="flex-row items-center bg-secondary/50 px-3 py-1 rounded-full gap-2">
                        <Text className="font-medium">{app.ownerName || "Unknown"}</Text>
                    </View>
                </View>

                {/* Progress */}
                <View className="mb-5">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-medium text-lg text-muted-foreground">Progress</Text>
                        <Text className="font-bold text-lg">{app.currentTesters || 0} / {app.requiredTesters} testers</Text>
                    </View>
                    <View className="h-2 bg-secondary rounded-full overflow-hidden w-full">
                        <View
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(100, ((app.currentTesters || 0) / app.requiredTesters) * 100)}%` }}
                        />
                    </View>
                </View>

                {/* Select App to Offer */}
                <View className="mb-5">
                    <Text className="font-bold text-lg mb-2">My App to Offer</Text>

                    {selectedAppData ? (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsModalVisible(true)}
                            className="flex-row items-center gap-3 p-3 border border-primary/50 bg-primary/5 rounded-xl"
                        >
                            <Image
                                source={{ uri: selectedAppData.iconUrl || 'https://github.com/shadcn.png' }}
                                className="w-10 h-10 rounded-lg bg-muted"
                            />
                            <View className="flex-1">
                                <Text className="font-medium text-lg">{selectedAppData.title}</Text>
                                <Text className="text-xs text-muted-foreground">Click to change</Text>
                            </View>
                            <Icon as={CheckCircleIcon} className="text-primary size-5" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsModalVisible(true)}
                            className="flex-row items-center gap-3 p-3 border border-dashed border-muted-foreground/40 rounded-xl bg-muted/10 justify-center h-16"
                        >
                            <Text className="text-muted-foreground font-medium">Select an app to swap...</Text>
                        </TouchableOpacity>
                    )}

                    <Text className="text-muted-foreground text-sm mt-2">
                        You must offer one of your apps for mutual testing.
                    </Text>
                </View>

                {/* Testers Section (Owner Only) */}
                {app.isMine && (
                    <View className="mb-20">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="font-bold text-lg">Active Testers ({testers?.length || 0})</Text>
                        </View>

                        {testers && testers.length > 0 ? (
                            testers.map((tester) => (
                                <View
                                    key={tester.matchId}
                                    className="flex-row items-center gap-3 p-4 bg-secondary/20 rounded-xl mb-3 border border-border/50"
                                >
                                    <Image
                                        source={{ uri: tester.testerAvatar }}
                                        className="size-10 rounded-full bg-muted"
                                    />
                                    <View className="flex-1">
                                        <View className="flex-row items-center gap-2">
                                            <Text className="font-bold">{tester.testerName}</Text>
                                            {tester.hasUnread && (
                                                <View className="bg-red-500 w-2.5 h-2.5 rounded-full border border-background shadow-sm" />
                                            )}
                                        </View>
                                        <Text className="text-xs text-muted-foreground">Day {tester.day} of 14</Text>
                                    </View>
                                    <View className="items-end">
                                        {tester.uploadedToday ? (
                                            <View className="flex-row items-center gap-1 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-lg">
                                                <Icon as={CheckCircleIcon} className="size-3 text-green-600 dark:text-green-400" />
                                                <Text className="text-[10px] font-bold text-green-600 dark:text-green-400">UPLOADED</Text>
                                            </View>
                                        ) : (
                                            <View className="flex-row items-center gap-1 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded-lg">
                                                <Icon as={XIcon} className="size-3 text-orange-600 dark:text-orange-400" />
                                                <Text className="text-[10px] font-bold text-orange-600 dark:text-orange-400">PENDING</Text>
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            onPress={() => router.push({ pathname: "/(tabs)/match/[id]", params: { id: tester.matchId } } as any)}
                                            className="mt-1"
                                        >
                                            <Text className="text-xs text-primary font-medium">View Progress</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        ) : (
                            <View className="items-center py-10 bg-muted/5 rounded-xl border border-dashed border-border">
                                <Icon as={UsersIcon} className="size-8 text-muted-foreground mb-2 opacity-50" />
                                <Text className="text-muted-foreground text-center">No active testers yet. Share your app to get started!</Text>
                            </View>
                        )}
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
                        <View className="flex-row gap-3">
                            <Button
                                size="lg"
                                variant="outline"
                                onPress={() => Alert.alert("Coming Soon", "Edit functionality is under development.")}
                                className="flex-1 rounded-xl border-primary/20"
                                disabled={isSubmitting}
                            >
                                <Icon as={EditIcon} className="size-4 text-primary mr-2" />
                                <Text className="font-bold">Edit</Text>
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                onPress={() => {
                                    Alert.alert(
                                        "Delete App",
                                        "Are you sure? This cannot be undone.",
                                        [
                                            { text: "Cancel", style: "cancel" },
                                            {
                                                text: "Delete",
                                                style: "destructive",
                                                onPress: async () => {
                                                    try {
                                                        setIsSubmitting(true);
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
                                className="flex-1 rounded-xl border-destructive/20"
                                disabled={isSubmitting}
                            >
                                <Icon as={Trash2Icon} className="size-4 text-destructive mr-2" />
                                <Text className="font-bold text-destructive">Delete</Text>
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
