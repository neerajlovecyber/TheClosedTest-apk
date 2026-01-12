
import React from 'react';
import { View, Image } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
    PlusIcon,
    AppWindowIcon,
    UsersIcon,
    HandshakeIcon,
    CameraIcon,
    CheckCircle2Icon,
    StarIcon,
    UploadCloudIcon,
    ShieldCheckIcon,
    SmartphoneIcon,
    UserIcon,
    SearchIcon,
    ArrowRightIcon,
    PartyPopperIcon,
    ActivityIcon
} from 'lucide-react-native';

interface OnboardingMockupProps {
    type: 'welcome' | 'add-app' | 'marketplace' | 'testing' | 'success';
}

export function OnboardingMockup({ type }: OnboardingMockupProps) {
    switch (type) {
        case 'welcome':
            return <WelcomeMockup />;
        case 'add-app':
            return <AddAppMockup />;
        case 'marketplace':
            return <MarketplaceMockup />;
        case 'testing':
            return <TestingMockup />;
        case 'success':
            return <SuccessMockup />;
        default:
            return null;
    }
}

function WelcomeMockup() {
    return (
        <View className="items-center justify-center">
            <View className="relative">
                {/* Abstract App Icon Box */}
                <View className="bg-primary/20 absolute inset-0 rotate-6 rounded-[32px] scale-95" />
                <View className="bg-primary/40 absolute inset-0 -rotate-3 rounded-[32px] scale-95" />

                <View className="w-40 h-40 bg-primary rounded-[32px] items-center justify-center shadow-xl shadow-primary/50 relative z-10 border border-primary-foreground/20">
                    <Text className="text-6xl font-black text-primary-foreground tracking-tighter">12</Text>
                    <Text className="text-xs font-bold text-primary-foreground/80 uppercase tracking-[0.2em] mt-1">Testers</Text>
                </View>

                {/* Floating Elements (Badges) */}
                <View className="absolute -right-6 -top-4 bg-background p-2 rounded-2xl shadow-sm border border-border z-20 rotate-12">
                    <View className="bg-green-500 rounded-full p-2">
                        <Icon as={CheckCircle2Icon} className="text-white size-6" />
                    </View>
                </View>
                <View className="absolute -left-4 -bottom-2 bg-background p-2 rounded-2xl shadow-sm border border-border z-20 -rotate-6">
                    <View className="bg-blue-500 rounded-full p-2">
                        <Icon as={UsersIcon} className="text-white size-6" />
                    </View>
                </View>
            </View>
        </View>
    );
}

function AddAppMockup() {
    return (
        <View className="w-full max-w-[280px] gap-3">
            {/* Form Field Mockup */}
            <View className="bg-card w-full p-4 rounded-xl border border-border shadow-sm gap-3">
                <View className="gap-1.5">
                    <Text className="text-xs font-semibold text-foreground">Play Store Link</Text>
                    <View className="w-full h-10 bg-muted/30 rounded-lg border border-border flex-row items-center px-3 gap-2 overflow-hidden">
                        <Icon as={AppWindowIcon} className="text-muted-foreground size-4 shrink-0" />
                        <Text className="text-xs text-muted-foreground flex-1" numberOfLines={1} ellipsizeMode="tail">
                            play.google.com/store/apps/details?id=...
                        </Text>
                    </View>
                </View>
                <View className="bg-primary rounded-lg h-9 items-center justify-center mt-1">
                    <Text className="text-xs font-bold text-primary-foreground">Add Application</Text>
                </View>
            </View>

            <View className="flex-row justify-center">
                <Icon as={ArrowRightIcon} className="text-muted-foreground/50 size-6" />
            </View>

            {/* Resulting App Card */}
            <View className="bg-card p-3 rounded-xl border border-border shadow-sm opacity-80 scale-95 origin-top">
                <View className="flex-row gap-3 items-center">
                    <View className="w-10 h-10 rounded-lg bg-red-500/20 items-center justify-center">
                        <Icon as={ActivityIcon} className="size-5 text-red-600" />
                    </View>
                    <View className="flex-1">
                        <Text className="font-bold text-sm text-foreground">Fitness Tracker Pro</Text>
                        <View className="flex-row items-center gap-1 mt-0.5">
                            <View className="bg-green-500/10 px-1.5 py-0.5 rounded">
                                <Text className="text-[10px] font-bold text-green-600">Active</Text>
                            </View>
                            <Text className="text-[10px] text-muted-foreground">0/12 Testers</Text>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

function MarketplaceMockup() {
    return (
        <View className="w-full max-w-[280px] bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {/* Header Mockup */}
            <View className="bg-muted/30 px-4 py-3 border-b border-border flex-row items-center justify-between">
                <Text className="font-bold text-sm">Marketplace</Text>
                <Icon as={SearchIcon} className="size-4 text-muted-foreground" />
            </View>

            <View className="p-3 gap-3">
                {/* Search Bar */}
                <View className="bg-background p-2 rounded-lg border border-border flex-row items-center gap-2">
                    <Icon as={SearchIcon} className="text-muted-foreground size-3 ml-1" />
                    <Text className="text-[10px] text-muted-foreground">Find testers for "Fitness Tracker"...</Text>
                </View>

                {/* Tester Cards Stack */}
                <View className="gap-2.5">
                    {/* Card 1 */}
                    <View className="bg-muted/10 p-3 rounded-xl border border-border flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                            <View className="w-8 h-8 rounded-full bg-blue-500/20 items-center justify-center">
                                <Text className="text-[10px] font-bold text-blue-600">JD</Text>
                            </View>
                            <View>
                                <Text className="text-xs font-bold text-foreground">John Doe</Text>
                                <View className="flex-row gap-1 items-center">
                                    <Icon as={StarIcon} className="size-2.5 text-orange-400 fill-orange-400" />
                                    <Text className="text-[10px] font-bold text-foreground">150</Text>

                                </View>
                            </View>
                        </View>
                        <View className="bg-primary px-3 py-1.5 rounded-full">
                            <Text className="text-[10px] font-bold text-primary-foreground">Request</Text>
                        </View>
                    </View>

                    {/* Card 2 (Faded) */}
                    <View className="bg-muted/10 p-3 rounded-xl border border-border flex-row items-center justify-between opacity-50">
                        <View className="flex-row items-center gap-3">
                            <View className="w-8 h-8 rounded-full bg-purple-500/20 items-center justify-center">
                                <Text className="text-[10px] font-bold text-purple-600">JS</Text>
                            </View>
                            <View>
                                <Text className="text-xs font-bold text-foreground">Jane Smith</Text>
                                <View className="flex-row gap-1 items-center">
                                    <Icon as={StarIcon} className="size-2.5 text-orange-400 fill-orange-400" />
                                    <Text className="text-[10px] font-bold text-foreground">98</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

function TestingMockup() {
    return (
        <View className="w-full max-w-[240px] items-center">
            {/* Phone Frame */}
            <View className="w-full aspect-[4/3] bg-card border border-border rounded-2xl p-4 shadow-md relative overflow-hidden">
                <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center gap-2">
                        <View className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <Text className="text-xs font-bold text-foreground">Day 1 of 14</Text>
                    </View>
                    <Text className="text-[10px] text-muted-foreground">Due: 12h</Text>
                </View>

                {/* Tasks List */}
                <View className="gap-2">
                    <View className="flex-row items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <View className="w-4 h-4 rounded border border-muted-foreground/30 bg-green-500 border-transparent items-center justify-center">
                            <Icon as={CheckCircle2Icon} className="text-white size-3" />
                        </View>
                        <Text className="text-xs text-muted-foreground">Install App</Text>
                    </View>
                    <View className="flex-row items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
                        <View className="w-4 h-4 rounded-2 border-primary items-center justify-center" />
                        <Text className="text-xs font-medium text-foreground">Upload Screenshot</Text>
                    </View>
                </View>
            </View>

            {/* Floating Camera Button */}
            <View className="absolute -bottom-4 bg-primary px-4 py-2 rounded-full shadow-lg flex-row items-center gap-2">
                <Icon as={CameraIcon} className="text-primary-foreground size-4" />
                <Text className="text-xs font-bold text-primary-foreground">Upload Proof</Text>
            </View>
        </View>
    );
}

function SuccessMockup() {
    return (
        <View className="items-center justify-center w-full gap-6">
            {/* Celebration Header */}
            <View className="items-center">
                <View className="w-20 h-20 bg-green-500/10 rounded-full items-center justify-center mb-2 ring-8 ring-green-500/5">
                    <Icon as={PartyPopperIcon} className="text-green-600 size-10" />
                </View>
                <Text className="text-lg font-black text-foreground">Congratulations!</Text>
                <Text className="text-xs text-muted-foreground text-center">Your app is live</Text>
            </View>

            <View className="relative w-full max-w-[280px]">
                {/* Success Badge Floating */}
                <View className="absolute -top-3 -right-3 z-10 bg-background rounded-full p-1.5 shadow-sm border border-border">
                    <View className="bg-green-500 rounded-full p-1.5">
                        <Icon as={CheckCircle2Icon} className="text-white size-4" />
                    </View>
                </View>

                {/* App Card */}
                <View className="bg-card p-4 rounded-2xl border border-primary/50 shadow-xl shadow-primary/20">
                    <View className="flex-row items-start gap-4">
                        <View className="w-14 h-14 rounded-2xl bg-red-500/20 items-center justify-center">
                            <Icon as={ActivityIcon} className="size-8 text-red-600" />
                        </View>
                        <View className="flex-1 gap-1">
                            <Text className="font-bold text-lg text-foreground">Fitness Tracker</Text>
                            <Text className="text-xs text-muted-foreground">com.fitness.tracker</Text>

                            <View className="flex-row items-center gap-2 mt-2">
                                <View className="bg-green-500 px-2.5 py-1 rounded-full flex-row items-center gap-1.5">
                                    <Icon as={PartyPopperIcon} className="text-white size-3" />
                                    <Text className="text-[10px] font-bold text-white uppercase tracking-wide">Production Active</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}
