import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { ActivityIcon, UserPlusIcon, ChevronRightIcon, MessageSquareIcon, Trash2Icon, AlertTriangleIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { toast } from '@/lib/sonner';
import { useAdminStats, useAdminCleanAllApps } from '@/lib/api-hooks';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminDashboardScreen() {
    const router = useRouter();
    const { data: stats } = useAdminStats();
    const totalUsersCount = stats?.totalUsers ?? 0;
    const activeMatchesCount = stats?.activeMatches ?? 0;
    const totalAppsCount = stats?.totalApps ?? 0;

    const [showCleanConfirm, setShowCleanConfirm] = useState(false);
    const cleanAllAppsMutation = useAdminCleanAllApps();

    const handleCleanAllApps = async () => {
        try {
            const res = await cleanAllAppsMutation.mutateAsync();
            toast.success('Marketplace Cleaned', {
                description: `${res.deletedAppsCount} apps and associated test records removed.`,
            });
        } catch (error: any) {
            toast.error('Clean failed', {
                description: error.message || 'Could not clean apps.',
            });
        } finally {
            setShowCleanConfirm(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            {/* Header */}
            <View className="px-6 pt-6 pb-4">
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">Admin</Text>
                <Text className="text-sm text-muted-foreground mt-0.5">Dashboard &amp; Overview</Text>
            </View>

            <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Key Metrics - Hero Cards */}
                <View className="flex-row gap-3 mb-6">
                    <Card className="border-border shadow-sm h-32 bg-card flex-1">
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
                                <Text className="text-3xl font-extrabold text-foreground tracking-tight">{totalUsersCount}</Text>
                                <Text className="text-xs text-muted-foreground font-medium mt-1">Total Users</Text>
                            </View>
                        </CardContent>
                    </Card>

                    <Card className="border-border shadow-sm h-32 bg-card flex-1">
                        <CardContent className="p-4 flex-1 justify-between">
                            <View className="flex-row items-start justify-between">
                                <View className="bg-emerald-500/10 p-2 rounded-lg">
                                    <Icon as={UserPlusIcon} className="text-emerald-500 size-5" />
                                </View>
                                <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
                                    <Text className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider">Active</Text>
                                </View>
                            </View>
                            <View>
                                <Text className="text-3xl font-extrabold text-foreground tracking-tight">{activeMatchesCount}</Text>
                                <Text className="text-xs text-muted-foreground font-medium mt-1">Active Tests ({totalAppsCount} Apps)</Text>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                {/* Quick Actions */}
                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">Support Management</Text>

                <Card className="border-border shadow-sm mb-4">
                    <TouchableOpacity
                        className="flex-row items-center justify-between p-4"
                        onPress={() => router.push('/admin/chats-list' as any)}
                    >
                        <View className="flex-row items-center">
                            <View className="bg-purple-500/10 p-2.5 rounded-xl mr-3">
                                <Icon as={MessageSquareIcon} className="text-purple-600 size-5" />
                            </View>
                            <View>
                                <Text className="font-semibold text-foreground">Support Inbox</Text>
                                <Text className="text-xs text-muted-foreground">Find users, manage tickets &amp; chat directly</Text>
                            </View>
                        </View>
                        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
                    </TouchableOpacity>
                </Card>

                {/* Maintenance & Dangerous Actions */}
                <Text className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3 px-1">Danger Zone &amp; Reset</Text>

                <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/40 shadow-sm mb-4">
                    <TouchableOpacity
                        className="flex-row items-center justify-between p-4"
                        onPress={() => setShowCleanConfirm(true)}
                        disabled={cleanAllAppsMutation.isPending}
                    >
                        <View className="flex-row items-center flex-1 mr-2">
                            <View className="bg-red-500/10 p-2.5 rounded-xl mr-3">
                                {cleanAllAppsMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#ef4444" />
                                ) : (
                                    <Icon as={Trash2Icon} className="text-red-500 size-5" />
                                )}
                            </View>
                            <View className="flex-1">
                                <Text className="font-semibold text-red-700 dark:text-red-400">Clean All Apps (Reset Marketplace)</Text>
                                <Text className="text-xs text-red-600/80 dark:text-red-400/70">
                                    Deletes all apps, matches &amp; testing logs for a fresh start
                                </Text>
                            </View>
                        </View>
                        <Icon as={ChevronRightIcon} className="text-red-400 size-5" />
                    </TouchableOpacity>
                </Card>
            </ScrollView>

            <AlertDialog open={showCleanConfirm} onOpenChange={setShowCleanConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset All Marketplace Apps?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete ALL apps, matches, and proof logs across the entire database. Real user accounts and reputations will be kept intact.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowCleanConfirm(false)}>
                            <Text>Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onPress={handleCleanAllApps}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            <Text className="text-white font-bold">Yes, Delete All Apps</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SafeAreaView>
    );
}
