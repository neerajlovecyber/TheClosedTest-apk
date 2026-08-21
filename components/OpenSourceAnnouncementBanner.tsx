import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Linking, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { SparklesIcon, Code2Icon, XIcon, ExternalLinkIcon } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'opensource_banner_dismissed_until_v1';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function OpenSourceAnnouncementBanner() {
    const [isVisible, setIsVisible] = useState<boolean | null>(null);

    useEffect(() => {
        const checkDismissal = async () => {
            try {
                if (Platform.OS === 'web') {
                    const dismissedUntil = localStorage.getItem(STORAGE_KEY);
                    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
                        setIsVisible(false);
                        return;
                    }
                } else {
                    const dismissedUntil = await SecureStore.getItemAsync(STORAGE_KEY);
                    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
                        setIsVisible(false);
                        return;
                    }
                }
                setIsVisible(true);
            } catch {
                setIsVisible(true);
            }
        };

        checkDismissal();
    }, []);

    const handleDismiss = async () => {
        setIsVisible(false);
        const until = (Date.now() + SEVEN_DAYS_MS).toString();
        try {
            if (Platform.OS === 'web') {
                localStorage.setItem(STORAGE_KEY, until);
            } else {
                await SecureStore.setItemAsync(STORAGE_KEY, until);
            }
        } catch (e) {
            console.error('Failed to save dismissal state', e);
        }
    };

    const handleOpenGitHub = () => {
        Linking.openURL('https://github.com/neerajlovecyber/TheClosedTest-apk').catch(() => {});
    };

    if (!isVisible) return null;

    return (
        <View className="px-6 mb-4">
            <Card className="border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:bg-blue-950/20 overflow-hidden shadow-sm">
                <CardContent className="p-4">
                    {/* Top Row: Icon, Tag & Dismiss X */}
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2">
                            <View className="bg-blue-500/20 p-1.5 rounded-lg">
                                <Icon as={SparklesIcon} className="size-4 text-blue-500 dark:text-blue-400" />
                            </View>
                            <Text className="text-xs font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                Major Update • Open Source
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleDismiss}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            className="p-1 rounded-full active:bg-muted/40"
                        >
                            <Icon as={XIcon} className="size-4 text-muted-foreground" />
                        </TouchableOpacity>
                    </View>

                    {/* Headline & Body */}
                    <Text className="text-base font-bold text-foreground mb-1">
                        The Closed Test is now 100% Open Source! 🚀
                    </Text>
                    <Text className="text-xs text-muted-foreground leading-relaxed mb-3">
                        We've open-sourced the entire platform on GitHub and upgraded to our high-performance backend. Start adding your apps and testing now!
                    </Text>

                    {/* Action Buttons */}
                    <View className="flex-row items-center gap-2">
                        <Button
                            size="sm"
                            className="flex-1 rounded-xl flex-row items-center justify-center gap-1.5 h-9 bg-blue-600 hover:bg-blue-700"
                            onPress={handleOpenGitHub}
                        >
                            <Icon as={Code2Icon} className="size-3.5 text-white" />
                            <Text className="text-white text-xs font-bold">View GitHub Repo</Text>
                            <Icon as={ExternalLinkIcon} className="size-3 text-white/80" />
                        </Button>

                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl h-9 px-4"
                            onPress={handleDismiss}
                        >
                            <Text className="text-xs font-semibold text-foreground">Got it</Text>
                        </Button>
                    </View>
                </CardContent>
            </Card>
        </View>
    );
}
