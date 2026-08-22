import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { FlaskConicalIcon, HomeIcon, SettingsIcon, StoreIcon, ShieldIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useCurrentUser, useMatches } from '@/lib/api-hooks';
import { getMatchCurrentDay } from '@/lib/date-utils';

export default function TabLayout() {
    const { user } = useUser();
    const ADMIN_EMAILS = ['neerajlovecyber@gmail.com', 'futureaistudio41@gmail.com'];
    const isAdmin = user?.emailAddresses.some(e => ADMIN_EMAILS.includes(e.emailAddress));
    const insets = useSafeAreaInsets();

    const { data: currentUser } = useCurrentUser();
    const { data: activeMatches = [] } = useMatches('active');

    // Only show red badge on Tests if there is an actual task pending action
    const hasPendingTasks = React.useMemo(() => {
        if (!currentUser?.id) return false;
        return activeMatches.some((m) => {
            const isUser1 = m.user1Id === currentUser.id;
            const myLastProof = isUser1 ? m.user1LastProof : m.user2LastProof;
            const partnerLastProof = isUser1 ? m.user2LastProof : m.user1LastProof;

            const highestProofDay = Math.max(1, myLastProof?.day || 1, partnerLastProof?.day || 1);
            const currentDay = getMatchCurrentDay(m.startDate, m.createdAt, highestProofDay);

            // 1. Partner uploaded a proof that you need to review
            const needsReview = partnerLastProof?.status === 'pending';
            // 2. You haven't uploaded today's proof (or proof for today was rejected)
            const needsUpload = !myLastProof || myLastProof.day < currentDay || (myLastProof.day === currentDay && (myLastProof.status as string) === 'rejected');

            return needsReview || needsUpload;
        });
    }, [activeMatches, currentUser?.id]);

    return (
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
            <Tabs
                screenOptions={{
                    tabBarHideOnKeyboard: false,
                    headerTitleAlign: 'left',
                    headerTitleStyle: { paddingLeft: 16 },
                    tabBarStyle: {
                        height: 60 + insets.bottom,
                        paddingBottom: insets.bottom + 4,
                        paddingTop: 8,
                    },
                    tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: '500',
                    },
                    headerShown: false,
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ color }) => <Icon as={HomeIcon} color={color} className="size-6" />,
                    }}
                />
                <Tabs.Screen
                    name="marketplace"
                    options={{
                        title: 'Marketplace',
                        tabBarIcon: ({ color }) => <Icon as={StoreIcon} color={color} className="size-6" />,
                        headerShown: false,
                    }}
                />
                <Tabs.Screen
                    name="tests"
                    options={{
                        title: 'Tests',
                        tabBarIcon: ({ color }) => (
                            <View style={{ position: 'relative' }}>
                                <Icon as={FlaskConicalIcon} color={color} className="size-6" />
                                {hasPendingTasks && (
                                    <View
                                        style={{ position: 'absolute', top: -4, right: -6, width: 10, height: 10, backgroundColor: '#ef4444', borderRadius: 5 }}
                                    />
                                )}
                            </View>
                        ),
                    }}
                />
                <Tabs.Screen
                    name="settings"
                    options={{
                        title: 'Settings',
                        tabBarIcon: ({ color }) => <Icon as={SettingsIcon} color={color} className="size-6" />,
                    }}
                />
                <Tabs.Screen
                    name="match/[id]"
                    options={{
                        href: null,
                        headerShown: false,
                    }}
                />
                <Tabs.Screen
                    name="admin"
                    options={{
                        title: 'Admin',
                        href: isAdmin ? '/admin' : null,
                        tabBarIcon: ({ color }) => (
                            <View style={{ position: 'relative' }}>
                                <Icon as={ShieldIcon} color={color} className="size-6" />
                            </View>
                        ),
                        headerShown: false,
                    }}
                />
            </Tabs>
        </View>
    );
}
