import React, { useState } from 'react';
import { View, ScrollView, useWindowDimensions, Pressable, Share } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
    AppWindowIcon,
    UsersIcon,
    HandshakeIcon,
    CameraIcon,
    CheckCircle2Icon,
    TrophyIcon,
    StarIcon,
    AlertTriangleIcon,
    ClockIcon,
    XCircleIcon,
    LockIcon,
    SparklesIcon,
    CopyIcon,
    CheckIcon,
    ShareIcon
} from 'lucide-react-native';
import { Stack } from 'expo-router';

const GOOGLE_GROUP_EMAIL = 'developers-community-official@googlegroups.com';

function CopyableItem({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await Share.share({ message: value });
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.log('Share error:', error);
        }
    };

    return (
        <Pressable
            onPress={handleCopy}
            className="flex-row items-center justify-between p-4 rounded-xl bg-primary/10 active:bg-primary/20"
        >
            <View className="flex-1 mr-3">
                <Text className="text-xs text-muted-foreground mb-1">{label}</Text>
                <Text className="text-sm font-mono font-semibold text-foreground" numberOfLines={1}>
                    {value}
                </Text>
            </View>
            <View className={`w-10 h-10 rounded-full items-center justify-center ${copied ? 'bg-green-500' : 'bg-primary'}`}>
                <Icon as={copied ? CheckIcon : ShareIcon} className="text-white size-5" />
            </View>
        </Pressable>
    );
}

interface StepCardProps {
    step: number;
    icon: any;
    title: string;
    description: string;
    color: string;
}

function StepCard({ step, icon, title, description, color }: StepCardProps) {
    return (
        <View className="flex-row items-start gap-4 mb-4">
            <View className={`w-14 h-14 rounded-2xl items-center justify-center ${color}`}>
                <Icon as={icon} className="text-white size-7" />
            </View>
            <View className="flex-1 pt-1">
                <Text className="text-xs font-bold text-muted-foreground uppercase mb-0.5">Step {step}</Text>
                <Text className="text-base font-bold text-foreground mb-1">{title}</Text>
                <Text className="text-sm text-muted-foreground leading-relaxed">{description}</Text>
            </View>
        </View>
    );
}

interface BadgeItemProps {
    icon: any;
    label: string;
    color: string;
    bgColor: string;
}

function BadgeItem({ icon, label, color, bgColor }: BadgeItemProps) {
    return (
        <View className="items-center mb-3" style={{ width: 75 }}>
            <View className={`w-12 h-12 rounded-xl items-center justify-center ${bgColor} mb-1.5`}>
                <Icon as={icon} className={`size-5 ${color}`} />
            </View>
            <Text className="text-[10px] text-center font-medium text-muted-foreground" numberOfLines={2}>{label}</Text>
        </View>
    );
}

export default function HelpScreen() {
    const { width } = useWindowDimensions();

    return (
        <>
            <Stack.Screen options={{ title: 'How It Works', headerShown: true }} />
            <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Hero */}
                <View className="items-center mb-6 pt-2">
                    <View className="w-20 h-20 rounded-3xl bg-primary/10 items-center justify-center mb-3">
                        <Icon as={SparklesIcon} className="text-primary size-10" />
                    </View>
                    <Text className="text-2xl font-black text-center">Welcome to The Closed Test</Text>
                    <Text className="text-muted-foreground text-center mt-1">Get 12+ testers for your app in exchange for testing others</Text>
                </View>

                {/* Quick Copy - Google Group */}
                <Card className="mb-4 border-primary/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">📋 Quick Copy</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-1">
                        <Text className="text-xs text-muted-foreground mb-3">
                            Tap to copy the Google Group email address. Add this to your Play Store closed testing testers list.
                        </Text>
                        <CopyableItem
                            label="Google Group Email"
                            value={GOOGLE_GROUP_EMAIL}
                        />
                    </CardContent>
                </Card>

                {/* How It Works Steps */}
                <Card className="mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">📱 How It Works</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <StepCard
                            step={1}
                            icon={AppWindowIcon}
                            title="Add Your App"
                            description="Submit your Android app with Play Store link and instructions for testers."
                            color="bg-blue-500"
                        />
                        <StepCard
                            step={2}
                            icon={UsersIcon}
                            title="Find Testing Partners"
                            description="Browse the marketplace and send swap requests to other developers."
                            color="bg-purple-500"
                        />
                        <StepCard
                            step={3}
                            icon={HandshakeIcon}
                            title="Mutual Testing Agreement"
                            description="When someone accepts, you both test each other's apps for 14 days."
                            color="bg-orange-500"
                        />
                        <StepCard
                            step={4}
                            icon={CameraIcon}
                            title="Daily Screenshots"
                            description="Upload a screenshot daily proving you used the app. Partner reviews it."
                            color="bg-cyan-500"
                        />
                        <StepCard
                            step={5}
                            icon={TrophyIcon}
                            title="Get 12 Testers"
                            description="Complete swaps with 12 partners to meet the closed testing requirement!"
                            color="bg-green-500"
                        />
                    </CardContent>
                </Card>

                {/* Status Badges */}
                <Card className="mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">🏷️ Status Guide</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <View className="flex-row flex-wrap justify-between">
                            <BadgeItem icon={CheckCircle2Icon} label="Approved" color="text-green-500" bgColor="bg-green-100 dark:bg-green-900/30" />
                            <BadgeItem icon={ClockIcon} label="Pending" color="text-orange-500" bgColor="bg-orange-100 dark:bg-orange-900/30" />
                            <BadgeItem icon={XCircleIcon} label="Rejected" color="text-red-500" bgColor="bg-red-100 dark:bg-red-900/30" />
                            <BadgeItem icon={AlertTriangleIcon} label="Missed" color="text-red-600" bgColor="bg-red-100 dark:bg-red-900/30" />
                        </View>
                    </CardContent>
                </Card>

                {/* Reputation System */}
                <Card className="mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">⭐ Reputation System</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <View className="gap-3">
                            <View className="flex-row items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                                <View className="w-10 h-10 rounded-full bg-green-500/20 items-center justify-center">
                                    <Text className="text-lg">+1</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-foreground">Proof Approved</Text>
                                    <Text className="text-xs text-muted-foreground">When your screenshot is approved</Text>
                                </View>
                            </View>
                            <View className="flex-row items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                                <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center">
                                    <Text className="text-lg">-2</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-foreground">Missed Day</Text>
                                    <Text className="text-xs text-muted-foreground">Didn't upload before midnight</Text>
                                </View>
                            </View>
                            <View className="flex-row items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                                <View className="w-10 h-10 rounded-full bg-red-500/20 items-center justify-center">
                                    <Text className="text-lg">-5</Text>
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-foreground">Proof Rejected</Text>
                                    <Text className="text-xs text-muted-foreground">Screenshot didn't meet requirements</Text>
                                </View>
                            </View>
                        </View>
                        <Text className="text-xs text-muted-foreground mt-3 text-center">Higher reputation = More trust from other developers</Text>
                    </CardContent>
                </Card>

                {/* FAQ */}
                <Card className="mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">❓ Frequently Asked Questions</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 gap-4">
                        <View>
                            <Text className="font-bold text-foreground mb-1">Why 14 days?</Text>
                            <Text className="text-sm text-muted-foreground">Google requires closed testers to test for at least 14 consecutive days before your app can be published.</Text>
                        </View>
                        <View>
                            <Text className="font-bold text-foreground mb-1">How many testers do I need?</Text>
                            <Text className="text-sm text-muted-foreground">You need at least 12 testers who complete the 14-day period. We help you find them through mutual swaps.</Text>
                        </View>
                        <View>
                            <Text className="font-bold text-foreground mb-1">What if my partner misses a day?</Text>
                            <Text className="text-sm text-muted-foreground">Their reputation decreases. You can choose partners with higher reputation for more reliability.</Text>
                        </View>
                        <View>
                            <Text className="font-bold text-foreground mb-1">Can I test multiple apps?</Text>
                            <Text className="text-sm text-muted-foreground">Yes! You can have multiple active swaps. More swaps = faster progress to 12 testers.</Text>
                        </View>
                        <View>
                            <Text className="font-bold text-foreground mb-1">How do I unlock more app slots?</Text>
                            <Text className="text-sm text-muted-foreground">You get 1 free slot. Watch a short ad to unlock additional slots (up to 3 total).</Text>
                        </View>
                    </CardContent>
                </Card>

                {/* Tips */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">💡 Pro Tips</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                        <View className="gap-2">
                            <Text className="text-sm text-muted-foreground">• Upload screenshots early to avoid last-minute rush</Text>
                            <Text className="text-sm text-muted-foreground">• Review partner's proof promptly to build goodwill</Text>
                            <Text className="text-sm text-muted-foreground">• Join the Google Group to stay eligible for swaps</Text>
                            <Text className="text-sm text-muted-foreground">• Write clear testing instructions for your app</Text>
                            <Text className="text-sm text-muted-foreground">• Keep your reputation high for better matches</Text>
                        </View>
                    </CardContent>
                </Card>
            </ScrollView>
        </>
    );
}
