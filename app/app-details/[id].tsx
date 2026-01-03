
import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Alert, Modal, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, StarIcon, SmartphoneIcon, ExternalLinkIcon, ShareIcon, CheckCircleIcon, XIcon } from 'lucide-react-native';
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
        if (app?.playStoreUrl && await Linking.canOpenURL(app.playStoreUrl)) {
            await Linking.openURL(app.playStoreUrl);
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
                        <TouchableOpacity onPress={handleOpenPlayStore} className="flex-row items-center bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-full self-start">
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

                {/* Requester Info (Ideally fetched via user relation query, simplified for now) */}
                <View className="flex-row justify-between items-center mb-4">
                    <Text className="font-medium text-lg text-muted-foreground">Requester</Text>
                    <View className="flex-row items-center bg-secondary/50 pl-1 pr-3 py-1 rounded-full gap-2">
                        {/* Placeholder Avatar */}
                        <View className="size-6 rounded-full bg-primary/20 items-center justify-center">
                            <Icon as={UserIcon} className="size-4 text-primary" />
                        </View>
                        <Text className="font-medium">App Owner</Text>
                        {/* We need to join user data in future query update */}
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
            </ScrollView>

            {/* Action Button */}
            <View className="p-4 border-t border-border bg-background safe-bottom">
                {app.isMine ? (
                    source === 'marketplace' ? (
                        <View className="w-full py-3 items-center justify-center bg-secondary/30 rounded-xl">
                            <Text className="text-muted-foreground font-semibold">Your App Listing</Text>
                        </View>
                    ) : (
                        <View className="gap-3">
                            <Button
                                variant="secondary"
                                onPress={() => router.push({ pathname: `/app-details/${app._id}`, params: { source: 'marketplace' } })}
                                className="w-full"
                            >
                                <Text>View Public Listing</Text>
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                onPress={() => {
                                    Alert.alert(
                                        "Manage App",
                                        "What would you like to do?",
                                        [
                                            { text: "Cancel", style: "cancel" },
                                            { text: "Edit", onPress: () => Alert.alert("Coming Soon", "Edit functionality is under development.") },
                                            {
                                                text: "Delete",
                                                style: "destructive",
                                                onPress: () => {
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
                                                                        router.replace('/(tabs)/apps'); // Go back to My Apps list (or home)
                                                                    } catch (err: any) {
                                                                        Alert.alert("Error", err.message);
                                                                    } finally {
                                                                        setIsSubmitting(false);
                                                                    }
                                                                }
                                                            }
                                                        ]
                                                    );
                                                }
                                            }
                                        ]
                                    );
                                }}
                                className="w-full"
                                disabled={isSubmitting}
                            >
                                <Text>Manage Options</Text>
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
                                    <Text className="font-bold text-white">Accept Request</Text>
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
// Helper icon not originally imported
function UserIcon(props: any) { return <Icon as={SmartphoneIcon} {...props} /> } // Fallback if UserIcon import fails or used differently
