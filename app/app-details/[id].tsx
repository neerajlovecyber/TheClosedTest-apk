
import React from 'react';
import { View, ScrollView, Image, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, StarIcon, CheckCircleIcon, SmartphoneIcon, UserIcon, ExternalLinkIcon, ShareIcon } from 'lucide-react-native';

export default function AppDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();

    // Mock Data (In reality, we would fetch app details by ID from Convex)
    const app = {
        title: 'SSB Buddy',
        packageName: 'com.example.ssb',
        description: 'The ultimate companion for SSB aspirants. Practice OIR, PPDT, and more. Need active testers who can provide feedback on the UI.',
        instructions: '1. Download the app and sign in using Google.\n2. Navigate to the "OIR Test" section and attempt one practice set.\n3. Go to Settings and try switching between Light and Dark mode.\n4. Report any crashes or UI glitches in the feedback section.',
        iconUrl: 'https://github.com/shadcn.png',
        currentTesters: 2,
        requiredTesters: 20,
        testersNeeded: 18,
        ownerName: 'Neeraj Singh',
        ownerAvatar: 'https://github.com/shadcn.png',
        reputation: 100,
        playStoreLink: 'https://play.google.com/store/apps/details?id=com.example.ssb',
    };

    const handleOpenPlayStore = async () => {
        if (await Linking.canOpenURL(app.playStoreLink)) {
            await Linking.openURL(app.playStoreLink);
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
                <Button variant="ghost" size="icon">
                    <Icon as={ShareIcon} className="text-foreground size-5" />
                </Button>
            </View>

            <ScrollView className="flex-1 px-6 pt-6">
                {/* Header Section */}
                <View className="flex-row items-center gap-4 mb-4">
                    <Image
                        source={{ uri: app.iconUrl }}
                        className="w-16 h-16 rounded-xl bg-muted border border-border"
                    />
                    <Text className="text-2xl font-bold">{app.title}</Text>
                </View>
                {/* Testing Instructions */}
                <View className="mb-4">
                    <Text className="font-bold text-lg mb-2">Testing Instructions</Text>
                    <View className="bg-secondary/30 p-4 rounded-xl">
                        <Text className="text-foreground leading-relaxed">
                            {app.description}
                        </Text>
                        <TouchableOpacity onPress={handleOpenPlayStore} className="flex-row items-center mt-3">
                            <Text className="text-primary font-bold mr-2">Open in Play Store</Text>
                            <Icon as={ExternalLinkIcon} className="size-4 text-primary" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Requester Info */}
                <View className="flex-row justify-between items-center mb-4">
                    <Text className="font-medium text-lg text-muted-foreground">Requester</Text>
                    <View className="flex-row items-center bg-secondary/50 pl-1 pr-3 py-1 rounded-full gap-2">
                        <Image
                            source={{ uri: app.ownerAvatar }}
                            className="w-6 h-6 rounded-full"
                        />
                        <Text className="font-medium">{app.ownerName}</Text>
                        <View className="flex-row items-center gap-1">
                            <Icon as={StarIcon} className="size-3 text-green-600 fill-green-600" />
                            <Text className="font-bold text-green-600 text-xs">{app.reputation}%</Text>
                        </View>
                    </View>
                </View>

                {/* Progress */}
                <View className="mb-5">
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-medium text-lg text-muted-foreground">Progress</Text>
                        <Text className="font-bold text-lg">{app.currentTesters} / {app.requiredTesters} testers</Text>
                    </View>
                    <View className="h-2 bg-secondary rounded-full overflow-hidden w-full">
                        <View
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(app.currentTesters / app.requiredTesters) * 100}%` }}
                        />
                    </View>
                </View>

                {/* Select App to Offer */}
                <View className="mb-5">
                    <Text className="font-bold text-lg mb-2">Select your app to offer</Text>
                    <TouchableOpacity activeOpacity={0.8} className="flex-row items-center gap-3 p-3 border border-border rounded-xl bg-card">
                        <Image
                            source={{ uri: app.iconUrl }} // Using same icon for demo, in reality would be user's app
                            className="w-10 h-10 rounded-lg bg-muted"
                        />
                        <Text className="font-medium text-lg">SSB Buddy</Text>
                        <View className="flex-1" />
                        <Icon as={SmartphoneIcon} className="text-muted-foreground size-5" />
                    </TouchableOpacity>
                    <Text className="text-muted-foreground text-sm mt-2">
                        You must offer one of your apps for mutual testing.
                    </Text>
                </View>
            </ScrollView>

            {/* Bottom Action Button */}
            <View className="p-4 border-t border-border bg-background">
                <Button size="lg" className="w-full rounded-xl">
                    <Text className="font-bold text-lg">Request Swap</Text>
                </Button>
            </View>
        </SafeAreaView >
    );
}
