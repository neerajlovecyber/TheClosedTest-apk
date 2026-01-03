import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { ActivityIcon, UserPlusIcon, BarChart3Icon, ChevronRightIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function AdminDashboardScreen() {
    const router = useRouter();
    const stats = useQuery(api.admin.getStats);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Header */}
            <View className="px-6 pt-6 pb-4">
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">Admin</Text>
                <Text className="text-sm text-muted-foreground mt-0.5">Dashboard &amp; Analytics</Text>
            </View>

            <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Key Metrics - Hero Cards */}
                <View className="flex-row gap-3 mb-6">
                    {/* DAU Card */}
                    <TouchableOpacity
                        className="flex-1"
                        onPress={() => router.push({ pathname: '/admin/users-list', params: { filter: 'active' } })}
                    >
                        <Card className="border-border shadow-sm h-32 bg-card">
                            <CardContent className="p-4 flex-1 justify-between">
                                <View className="flex-row items-start justify-between">
                                    <View className="bg-blue-500/10 p-2 rounded-lg">
                                        <Icon as={ActivityIcon} className="text-blue-500 size-5" />
                                    </View>
                                    <View className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                                        <Text className="text-blue-600 dark:text-blue-400 font-bold text-[10px] uppercase tracking-wider">Live</Text>
                                    </View>
                                </View>
                                <View>
                                    <Text className="text-3xl font-extrabold text-foreground tracking-tight">{stats?.dau ?? '-'}</Text>
                                    <Text className="text-xs text-muted-foreground font-medium mt-1">Active Today</Text>
                                </View>
                            </CardContent>
                        </Card>
                    </TouchableOpacity>

                    {/* New Users Card */}
                    <TouchableOpacity
                        className="flex-1"
                        onPress={() => router.push({ pathname: '/admin/users-list', params: { filter: 'new' } })}
                    >
                        <Card className="border-border shadow-sm h-32 bg-card">
                            <CardContent className="p-4 flex-1 justify-between">
                                <View className="flex-row items-start justify-between">
                                    <View className="bg-emerald-500/10 p-2 rounded-lg">
                                        <Icon as={UserPlusIcon} className="text-emerald-500 size-5" />
                                    </View>
                                    {(stats?.newUsersToday ?? 0) > 0 && (
                                        <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                                            <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider">+{stats?.newUsersToday}</Text>
                                        </View>
                                    )}
                                </View>
                                <View>
                                    <Text className="text-3xl font-extrabold text-foreground tracking-tight">{stats?.newUsersToday ?? '-'}</Text>
                                    <Text className="text-xs text-muted-foreground font-medium mt-1">New Users</Text>
                                </View>
                            </CardContent>
                        </Card>
                    </TouchableOpacity>
                </View>

                {/* Quick Actions */}
                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Quick Actions</Text>

                <Card className="border-border shadow-sm mb-4">
                    <TouchableOpacity
                        className="flex-row items-center justify-between p-4"
                        onPress={() => router.push('/admin/analytics')}
                    >
                        <View className="flex-row items-center">
                            <View className="bg-primary/10 p-2.5 rounded-xl mr-3">
                                <Icon as={BarChart3Icon} className="text-primary size-5" />
                            </View>
                            <View>
                                <Text className="font-semibold text-foreground">View All Analytics</Text>
                                <Text className="text-xs text-muted-foreground">Stats, users, matches & more</Text>
                            </View>
                        </View>
                        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
                    </TouchableOpacity>
                </Card>

            </ScrollView>
        </SafeAreaView>
    );
}
