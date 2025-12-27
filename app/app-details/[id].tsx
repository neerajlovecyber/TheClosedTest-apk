
import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, StarIcon, CheckCircleIcon, SmartphoneIcon, UserIcon } from 'lucide-react-native';

export default function AppDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();

    // Mock Data (In reality, we would fetch app details by ID from Convex)
    const app = {
        title: 'SSB Buddy',
        packageName: 'com.example.ssb',
        description: 'The ultimate companion for SSB aspirants. Practice OIR, PPDT, and more. Need active testers who can provide feedback on the UI.',
        iconUrl: 'https://github.com/shadcn.png',
        currentTesters: 0,
        requiredTesters: 14,
        ownerName: 'Neeraj Singh',
        ownerAvatar: 'https://github.com/shadcn.png',
        reputation: 100
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            {/* Header - No top safe area needed since presentation: 'modal' usually handles header or sheet handle */}
            <View className="flex-row items-center px-4 py-3 border-b border-border">
                <Button variant="ghost" size="icon" onPress={() => router.back()}>
                    <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                </Button>
                <Text className="text-lg font-bold ml-2">App Details</Text>
            </View>

            <ScrollView className="flex-1 p-4">
                {/* Main Info Card */}
                <Card className="mb-6">
                    <CardContent className="p-6 items-center">
                        <Image
                            source={{ uri: app.iconUrl }}
                            className="w-24 h-24 rounded-2xl mb-4 bg-muted border border-border"
                        />
                        <Text className="text-2xl font-bold text-center">{app.title}</Text>
                        <Text className="text-muted-foreground mb-4">{app.packageName}</Text>

                        <View className="flex-row gap-4 mb-6">
                            <View className="items-center">
                                <View className="bg-primary/10 p-2 rounded-full mb-1">
                                    <Icon as={UserIcon} className="text-primary size-5" />
                                </View>
                                <Text className="font-bold">{app.currentTesters}/{app.requiredTesters}</Text>
                                <Text className="text-xs text-muted-foreground">Testers</Text>
                            </View>
                            <View className="h-full w-[1px] bg-border" />
                            <View className="items-center">
                                <View className="bg-green-500/10 p-2 rounded-full mb-1">
                                    <Icon as={StarIcon} className="text-green-600 size-5" />
                                </View>
                                <Text className="font-bold">{app.reputation}%</Text>
                                <Text className="text-xs text-muted-foreground">Reputation</Text>
                            </View>
                        </View>

                        <Button className="w-full" size="lg">
                            <Text>Request to Swap</Text>
                        </Button>
                    </CardContent>
                </Card>

                {/* Owner Info */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>App Owner</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-row items-center gap-3">
                        <Image
                            source={{ uri: app.ownerAvatar }}
                            className="w-12 h-12 rounded-full bg-muted"
                        />
                        <View>
                            <Text className="font-bold text-lg">{app.ownerName}</Text>
                            <Text className="text-muted-foreground text-sm">Joined 2 months ago</Text>
                        </View>
                    </CardContent>
                </Card>

                {/* Instructions */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>Testing Instructions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Text className="text-muted-foreground leading-relaxed">
                            {app.description}
                        </Text>
                        <View className="mt-4 gap-2">
                            <View className="flex-row items-center gap-2">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-4" />
                                <Text className="text-sm">Install and keep for 14 days</Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                <Icon as={CheckCircleIcon} className="text-green-500 size-4" />
                                <Text className="text-sm">Submit daily proof of usage</Text>
                            </View>
                        </View>
                    </CardContent>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}
