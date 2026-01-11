import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'expo-router';
import { LucideIcon } from 'lucide-react-native';
import {
    CheckCircleIcon,
    ChevronRightIcon,
    InfoIcon,
    LogOutIcon,
    MessageSquareIcon,
    MoonIcon,
    Share2Icon,
    ShieldIcon,
    StarIcon,
    SunIcon,
    SparklesIcon,
    HelpCircleIcon,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Linking, ScrollView, View, Share, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';

interface SettingItemProps {
    icon: LucideIcon;
    label: string;
    subtitle?: string;
    onPress?: () => void;
    action?: React.ReactNode;
    destructive?: boolean;
    iconColor?: string;
}

function SettingItem({ icon, label, subtitle, onPress, action, destructive, iconColor }: SettingItemProps) {
    return (
        <TouchableOpacity
            className="flex-row items-center justify-between w-full py-4 px-4"
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View className="flex-row items-center gap-4 flex-1">
                <View className={`h-10 w-10 rounded-xl items-center justify-center ${iconColor || 'bg-primary/10'}`}>
                    <Icon
                        as={icon}
                        className={`size-5 ${destructive ? 'text-destructive' : iconColor ? 'text-white' : 'text-primary'}`}
                    />
                </View>
                <View className="flex-1">
                    <Text
                        className={`text-base font-semibold ${destructive ? 'text-destructive' : 'text-foreground'}`}
                    >
                        {label}
                    </Text>
                    {subtitle && (
                        <Text className="text-sm text-muted-foreground">{subtitle}</Text>
                    )}
                </View>
            </View>
            {action || (
                <Icon as={ChevronRightIcon} className="size-5 text-muted-foreground/50" />
            )}
        </TouchableOpacity>
    );
}

function UserProfile() {
    const { user } = useUser();
    const convexUser = useQuery(api.users.getCurrentUser);

    const { initials, imageSource, userName, email } = React.useMemo(() => {
        const userName = user?.fullName || user?.username || 'User';
        const email = user?.emailAddresses[0]?.emailAddress;
        const initials = (user?.fullName || user?.username || '')
            .split(' ')
            .map((name) => name[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        const imageSource = user?.imageUrl ? { uri: user.imageUrl } : undefined;
        return { initials, imageSource, userName, email };
    }, [user]);

    return (
        <Card className="mx-4 mb-4 border-0 overflow-hidden">
            <CardContent className="p-5">
                <View className="flex-row items-center gap-4">
                    <View>
                        <Avatar alt={`${userName}'s avatar`} className="h-20 w-20 border-4 border-primary/20">
                            <AvatarImage source={imageSource} />
                            <AvatarFallback className="bg-primary/10">
                                <Text className="text-2xl font-bold text-primary">{initials}</Text>
                            </AvatarFallback>
                        </Avatar>
                    </View>
                    <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                            <Text className="text-2xl font-bold text-foreground">{userName}</Text>
                        </View>
                        <Text className="text-muted-foreground font-medium mt-0.5">{email}</Text>

                        {convexUser?.isGroupMember && (
                            <View className="flex-row items-center mt-2">
                                <View className="bg-green-500/10 px-3 py-1 rounded-full">
                                    <Text className="text-xs text-green-600 dark:text-green-400 font-bold">✓ Verified Member</Text>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </CardContent>
        </Card>
    );
}


export default function SettingsScreen() {
    const { signOut } = useAuth();
    const { user } = useUser();
    const { colorScheme, toggleColorScheme } = useColorScheme();
    const router = useRouter();

    const isAdmin = user?.emailAddresses.some(e => e.emailAddress === 'neerajlovecyber@gmail.com');

    const handleShare = async () => {
        try {
            await Share.share({
                message: 'Check out The Closed Test on Google Play Store: https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest',
                url: 'https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest',
            });
        } catch (error) {
            console.error('Error sharing app:', error);
        }
    };

    const handleRate = () => {
        handleLink('https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest');
    };

    const handleLink = (url: string) => {
        Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
    };

    return (
        <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="flex-1">
                {/* Header */}
                <View className="px-6 pt-4 pb-6">
                    <Text className="text-3xl font-black text-foreground tracking-tight">Settings</Text>
                    <Text className="text-muted-foreground font-medium mt-1">Manage your account & preferences</Text>
                </View>

                <UserProfile />

                <View className="px-4 mb-4">
                    <GoogleGroupWidget />
                </View>

                <View className="px-4 gap-6">
                    {/* Appearance Section */}
                    <View className="gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Appearance</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0">
                            <CardContent className="p-0 gap-0">
                                <SettingItem
                                    icon={colorScheme === 'dark' ? MoonIcon : SunIcon}
                                    label="Dark Mode"
                                    subtitle={colorScheme === 'dark' ? 'Currently using dark theme' : 'Currently using light theme'}
                                    onPress={toggleColorScheme}
                                    action={
                                        <Switch
                                            checked={colorScheme === 'dark'}
                                            onCheckedChange={toggleColorScheme}
                                        />
                                    }
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Help Section */}
                    <View className="gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Help</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0">
                            <CardContent className="p-0 gap-0">
                                <SettingItem
                                    icon={HelpCircleIcon}
                                    label="How It Works"
                                    subtitle="Learn how to use the app"
                                    onPress={() => router.push('/help')}
                                    iconColor="bg-indigo-500"
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Support Section */}
                    <View className="gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Support Us</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0">
                            <CardContent className="p-0 gap-0 divide-y divide-border/30">
                                <SettingItem
                                    icon={Share2Icon}
                                    label="Share App"
                                    subtitle="Help others discover us"
                                    onPress={handleShare}
                                    iconColor="bg-blue-500"
                                />
                                <SettingItem
                                    icon={StarIcon}
                                    label="Rate Us"
                                    subtitle="Leave a review on Play Store"
                                    onPress={handleRate}
                                    iconColor="bg-amber-500"
                                />
                                <SettingItem
                                    icon={InfoIcon}
                                    label="About Us"
                                    subtitle="Learn more about our mission"
                                    onPress={() => router.push('/about-us')}
                                    iconColor="bg-violet-500"
                                />
                                <SettingItem
                                    icon={MessageSquareIcon}
                                    label="Send Feedback"
                                    subtitle="Report bugs or suggest features"
                                    onPress={() => handleLink('https://theclosedtest.featurebase.app/')}
                                    iconColor="bg-cyan-500"
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Legal Section */}
                    <View className="gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Legal</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0">
                            <CardContent className="p-0 gap-0">
                                <SettingItem
                                    icon={ShieldIcon}
                                    label="Privacy Policy"
                                    subtitle="How we handle your data"
                                    onPress={() => router.push('/privacy-policy')}
                                    iconColor="bg-green-500"
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Sign Out Button */}
                    <View className="pt-2">
                        <Button
                            variant="destructive"
                            size="lg"
                            className="w-full flex-row gap-3 rounded-2xl"
                            onPress={() => signOut()}
                        >
                            <Icon as={LogOutIcon} className="text-white size-5" />
                            <Text className="text-white text-lg font-semibold">Log Out</Text>
                        </Button>
                        <View className="items-center pt-6">
                            <Text className="text-xs text-muted-foreground/60">The Closed Test • Version {Constants.expoConfig?.version || '1.0.0'}</Text>
                        </View>
                    </View>

                </View>
            </View>
        </ScrollView>
    );
}
