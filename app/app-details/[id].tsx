
import React, { useState } from 'react';
import { View, ScrollView, Image, Linking, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, StarIcon, SmartphoneIcon, ExternalLinkIcon, ShareIcon, CheckCircleIcon, XIcon } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

export default function AppDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const appId = id as Id<"apps">;

    // Fetch App Details
    const app = useQuery(api.apps.getAppArgs, { appId });

    // Fetch user's own apps to offer
    const myApps = useQuery(api.apps.getMyApps) || [];

    // Mutation
    const requestSwap = useMutation(api.matches.requestSwap);

    const [selectedMyApp, setSelectedMyApp] = useState<Id<"apps"> | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initial selection if user has only one recruitng app
    React.useEffect(() => {
        if (myApps.length === 1 && !selectedMyApp) {
            setSelectedMyApp(myApps[0]._id);
        }
    }, [myApps]);

    const handleOpenPlayStore = async () => {
        if (app?.playStoreLink && await Linking.canOpenURL(app.playStoreLink)) {
            await Linking.openURL(app.playStoreLink);
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
            router.back();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to send request");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!app) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text>Loading app details...</Text>
            </SafeAreaView>
        );
    }

    const selectedAppData = myApps.find(a => a._id === selectedMyApp);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center px-4 py-3 border-b border-border justify-between">
                <View className="flex-row items-center">
                    <Button variant="ghost" size="icon" onPress={() => router.back()}>
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </Button>
                    <Text className="text-lg font-bold ml-2">App Details</Text>
                </View>
                <Button variant="ghost" size="icon">
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
                        <Text className="text-muted-foreground">{app.packageName}</Text>
                    </View>
                </View>

                {/* Testing Instructions */}
                <View className="mb-4">
                    <Text className="font-bold text-lg mb-2">Testing Instructions</Text>
                    <View className="bg-secondary/30 p-4 rounded-xl">
                        <Text className="text-foreground leading-relaxed">
                            {app.instructions || "No specific instructions provided."}
                        </Text>
                        <TouchableOpacity onPress={handleOpenPlayStore} className="flex-row items-center mt-3">
                            <Text className="text-primary font-bold mr-2">Open in Play Store</Text>
                            <Icon as={ExternalLinkIcon} className="size-4 text-primary" />
                        </TouchableOpacity>
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

            {/* Bottom Action Button */}
            <View className="p-4 border-t border-border bg-background">
                <Button
                    size="lg"
                    className="w-full rounded-xl"
                    onPress={handleRequestSwap}
                    disabled={isSubmitting}
                >
                    <Text className="font-bold text-lg">{isSubmitting ? 'Sending Request...' : 'Request Swap'}</Text>
                </Button>
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
