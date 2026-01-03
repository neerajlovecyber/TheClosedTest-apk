import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { UsersIcon, AppWindowIcon, ZapIcon, FileCheckIcon, ArrowLeftIcon, TrendingUpIcon, ActivityIcon, UserPlusIcon, BarChartIcon, FlameIcon, TrophyIcon } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';

export default function AnalyticsOverviewScreen() {
    const router = useRouter();
    const stats = useQuery(api.admin.getStats);

    const StatCard = ({ title, value, icon: IconComponent, trend, onPress, showChart }: any) => (
        <TouchableOpacity
            className="w-[48%] mb-3"
            onPress={onPress}
            disabled={!onPress}
        >
            <Card className="border-border shadow-sm">
                <CardContent className="p-3">
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="bg-secondary/30 p-1.5 rounded-md">
                            <Icon as={IconComponent} className="text-foreground size-4" />
                        </View>
                        {showChart && (
                            <View className="flex-row items-end gap-0.5 h-6">
                                <View className="w-1 bg-primary/20 h-2 rounded-t-sm" />
                                <View className="w-1 bg-primary/40 h-3 rounded-t-sm" />
                                <View className="w-1 bg-primary/30 h-2.5 rounded-t-sm" />
                                <View className="w-1 bg-primary/60 h-4 rounded-t-sm" />
                                <View className="w-1 bg-primary h-5 rounded-t-sm" />
                            </View>
                        )}
                        {!showChart && trend && (
                            <Icon as={trend.includes('+') ? TrendingUpIcon : TrendingUpIcon} className={trend.includes('+') ? "text-green-500 size-4" : "text-red-500 size-4"} />
                        )}
                    </View>

                    <Text className="text-2xl font-bold text-foreground">{value ?? '-'}</Text>
                    <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5" numberOfLines={1}>{title}</Text>

                    {trend && (
                        <Text className="text-[10px] text-green-600 dark:text-green-400 mt-1.5 font-medium">
                            {trend}
                        </Text>
                    )}
                </CardContent>
            </Card>
        </TouchableOpacity>
    );

    const UserRow = ({ item, index }: any) => (
        <View className={`flex-row items-center py-3 border-b border-border/50 ${index % 2 === 0 ? 'bg-secondary/10' : ''}`}>
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center mr-3">
                <Text className="font-bold text-muted-foreground">{item.name?.[0] || 'U'}</Text>
            </View>
            <View className="flex-1">
                <Text className="font-medium text-foreground">{item.name || 'Anonymous'}</Text>
                <Text className="text-xs text-muted-foreground">{item.email || 'No email'}</Text>
            </View>
            <View className="items-end">
                <Text className="text-xs text-foreground font-mono">{new Date(item.createdAt).toLocaleDateString()}</Text>
                <View className={`px-2 py-0.5 rounded-full mt-1 ${item.isGroupMember ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    <Text className={`text-[10px] font-bold ${item.isGroupMember ? 'text-green-600' : 'text-orange-600'}`}>
                        {item.isGroupMember ? 'Verified' : 'Unverified'}
                    </Text>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <View className="px-6 py-4 flex-row items-center border-b border-border/50">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">Full Analytics</Text>
            </View>

            <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
                {/* All Stats Grid */}
                <Text className="text-lg font-bold mb-3">Platform Statistics</Text>
                <View className="flex-row flex-wrap justify-between mb-6">
                    <StatCard
                        title="Daily Active Users"
                        value={stats?.dau}
                        icon={ActivityIcon}
                        showChart={true}
                        onPress={() => router.push({ pathname: '/admin/users-list', params: { filter: 'active' } })}
                    />
                    <StatCard
                        title="New Users Today"
                        value={stats?.newUsersToday}
                        icon={UserPlusIcon}
                        trend={stats?.trends?.newUsers !== undefined ? `${stats.trends.newUsers > 0 ? '+' : ''}${stats.trends.newUsers}% vs last week` : undefined}
                        showChart={true}
                        onPress={() => router.push({ pathname: '/admin/users-list', params: { filter: 'new' } })}
                    />
                    <StatCard
                        title="Total Users"
                        value={stats?.totalUsers}
                        icon={UsersIcon}
                        onPress={() => router.push({ pathname: '/admin/users-list', params: { filter: 'all' } })}
                    />
                    <StatCard
                        title="Active Matches"
                        value={stats?.activeMatches}
                        icon={ZapIcon}
                    />
                    <StatCard
                        title="Total Apps"
                        value={stats?.totalApps}
                        icon={AppWindowIcon}
                    />
                    <StatCard
                        title="Proofs Uploaded"
                        value={stats?.totalProofs}
                        icon={FileCheckIcon}
                    />
                </View>

                {/* Recent Users Table */}
                <Text className="text-lg font-bold mb-3">Recent Users</Text>
                <View className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                    <View className="p-4 pt-2">
                        {stats?.recentUsers ? (
                            stats.recentUsers.map((user: any, index: number) => (
                                <UserRow key={user._id} item={user} index={index} />
                            ))
                        ) : (
                            <Text className="text-center py-4 text-muted-foreground">Loading users...</Text>
                        )}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
