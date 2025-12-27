import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import {
    ChevronRightIcon,
    FileTextIcon,
    InfoIcon,
    LogOutIcon,
    MoonStarIcon,
    Share2Icon,
    ShieldIcon,
    StarIcon,
    SunIcon,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Linking, ScrollView, View } from 'react-native';

interface SettingItemProps {
    icon: React.ElementType;
    label: string;
    onPress?: () => void;
    action?: React.ReactNode;
    destructive?: boolean;
}

function SettingItem({ icon, label, onPress, action, destructive }: SettingItemProps) {
    return (
        <Button
            variant="ghost"
            className="flex-row items-center justify-between w-full h-14 px-4 border-b border-border/40 last:border-b-0"
            onPress={onPress}
        >
            <View className="flex-row items-center gap-3">
                <Icon
                    as={icon}
                    className={`size-5 ${destructive ? 'text-destructive' : 'text-muted-foreground'}`}
                />
                <Text
                    className={`text-base font-medium ${destructive ? 'text-destructive' : 'text-foreground'}`}
                >
                    {label}
                </Text>
            </View>
            {action || (
                <Icon as={ChevronRightIcon} className="size-5 text-muted-foreground/50" />
            )}
        </Button>
    );
}

function UserProfile() {
    const { user } = useUser();

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
        <View className="flex-row items-center gap-4 px-4 py-6">
            <Avatar alt={`${userName}'s avatar`} className="h-16 w-16">
                <AvatarImage source={imageSource} />
                <AvatarFallback>
                    <Text className="text-lg">{initials}</Text>
                </AvatarFallback>
            </Avatar>
            <View className="flex-1">
                <Text className="text-xl font-semibold">{userName}</Text>
                <Text className="text-muted-foreground">{email}</Text>
            </View>
        </View>
    );
}

export default function SettingsScreen() {
    const { signOut } = useAuth();
    const { colorScheme, toggleColorScheme } = useColorScheme();
    const router = useRouter();

    const handleShare = async () => {
        console.log('Share App');
    };

    const handleRate = () => {
        console.log('Rate Us');
    };

    const handleLink = (url: string) => {
        Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
    };

    return (
        <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="max-w-[600px] w-full mx-auto">
                <UserProfile />

                <View className="px-4 gap-6">
                    {/* Appearance Section */}
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-muted-foreground px-1 uppercase tracking-wider">Preferences</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0 bg-muted/30 dark:bg-muted/10 rounded-xl">
                            <CardContent className="p-0 gap-0">
                                <SettingItem
                                    icon={colorScheme === 'dark' ? MoonStarIcon : SunIcon}
                                    label="Dark Mode"
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

                    {/* Support Section */}
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-muted-foreground px-1 uppercase tracking-wider">Support</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0 bg-muted/30 dark:bg-muted/10 rounded-xl">
                            <CardContent className="p-0 gap-0">
                                <SettingItem icon={Share2Icon} label="Share App" onPress={handleShare} />
                                <SettingItem icon={StarIcon} label="Rate Us" onPress={handleRate} />
                                <SettingItem
                                    icon={InfoIcon}
                                    label="About Us"
                                    onPress={() => router.push('/about-us')}
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Legal Section */}
                    <View className="gap-2">
                        <Text className="text-sm font-medium text-muted-foreground px-1 uppercase tracking-wider">Legal</Text>
                        <Card className="overflow-hidden p-0 gap-0 border-0 bg-muted/30 dark:bg-muted/10 rounded-xl">
                            <CardContent className="p-0 gap-0">
                                <SettingItem
                                    icon={ShieldIcon}
                                    label="Privacy Policy"
                                    onPress={() => router.push('/privacy-policy')}
                                />
                            </CardContent>
                        </Card>
                    </View>

                    {/* Sign Out Button */}
                    <View className="pt-4">
                        <Button
                            variant="destructive"
                            className="w-full flex-row gap-2"
                            onPress={() => signOut()}
                        >
                            <Icon as={LogOutIcon} className="text-destructive-foreground size-4" />
                            <Text>Log Out</Text>
                        </Button>
                        <View className="items-center pt-4">
                            <Text className="text-xs text-muted-foreground">Version 1.0.0</Text>
                        </View>
                    </View>

                </View>
            </View>
        </ScrollView>
    );
}
