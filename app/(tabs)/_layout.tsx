import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { FlaskConicalIcon, HomeIcon, SettingsIcon, StoreIcon, ShieldIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { api } from '@/convex/_generated/api';
import { useCachedConvexQuery } from '@/hooks/useCachedConvexQuery';

export default function TabLayout() {
    const { user } = useUser();
    const ADMIN_EMAILS = ['neerajlovecyber@gmail.com', 'futureaistudio41@gmail.com'];
    const isAdmin = user?.emailAddresses.some(e => ADMIN_EMAILS.includes(e.emailAddress));
    const insets = useSafeAreaInsets();

    // Optimized: Check if ANY tasks need attention (boolean, not count)
    const { data: activeTests = [] } = useCachedConvexQuery(['activeTests'], api.matches.getMyActiveTests);
    const hasPendingTasks = activeTests.some((t: any) => t.needsAttention);

    // Optimized: Check if user has ANY unread from admin (boolean)
    const { data: hasUnreadFromAdmin = false } = useCachedConvexQuery(['hasUnreadFromAdmin'], api.adminChats.hasUnreadFromAdmin);

    // Optimized: Check if admin has ANY unread (boolean)
    const { data: hasUnreadForAdmin = false } = useCachedConvexQuery(['hasUnreadForAdmin'], api.adminChats.hasUnreadForAdmin);

    // Optimized: Check if there are ANY pending reports (boolean, not count)
    const { data: hasPendingReports = false } = useCachedConvexQuery(['hasPendingReports'], api.reports.hasPendingReports);
    const hasAdminNotifications = hasUnreadForAdmin || hasPendingReports;

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
                        tabBarIcon: ({ color }) => (
                            <View style={{ position: 'relative' }}>
                                <Icon as={SettingsIcon} color={color} className="size-6" />
                                {hasUnreadFromAdmin && (
                                    <View
                                        style={{ position: 'absolute', top: -4, right: -6, width: 10, height: 10, backgroundColor: '#ef4444', borderRadius: 5 }}
                                    />
                                )}
                            </View>
                        ),
                    }}
                />
                <Tabs.Screen
                    name="match/[id]"
                    options={{
                        href: null,
                        headerShown: false,
                        tabBarStyle: { display: 'flex' }
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
                                {hasAdminNotifications && (
                                    <View
                                        style={{ position: 'absolute', top: -4, right: -6, width: 10, height: 10, backgroundColor: '#ef4444', borderRadius: 5 }}
                                    />
                                )}
                            </View>
                        ),
                        headerShown: false,
                    }}
                />
            </Tabs>
        </View>
    );
}
