import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Trash2Icon, ChevronLeftIcon, ShieldAlertIcon } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { toast } from '@/lib/sonner';
import { useAdminCleanAllApps, useAdminCleanTestUsers } from '@/lib/api-hooks';
import { Button } from '@/components/ui/button';
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

export default function DangerZoneScreen() {
    const router = useRouter();
    const [showCleanConfirm, setShowCleanConfirm] = useState(false);
    const [showCleanUsersConfirm, setShowCleanUsersConfirm] = useState(false);
    const cleanAllAppsMutation = useAdminCleanAllApps();
    const cleanTestUsersMutation = useAdminCleanTestUsers();

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

    const handleCleanTestUsers = async () => {
        try {
            const res = await cleanTestUsersMutation.mutateAsync();
            toast.success('Test Users Cleaned', {
                description: res.message || `${res.deletedUsersCount} test users removed.`,
            });
        } catch (error: any) {
            toast.error('Clean failed', {
                description: error.message || 'Could not clean test users.',
            });
        } finally {
            setShowCleanUsersConfirm(false);
        }
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: 'Danger Zone',
                    headerLeft: () => (
                        <Button variant="ghost" size="icon" onPress={() => router.back()} className="mr-2">
                            <Icon as={ChevronLeftIcon} className="size-6" />
                        </Button>
                    ),
                }}
            />
            <ScrollView className="flex-1 bg-background px-4 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Warning Banner */}
                <Card className="border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 mb-6">
                    <CardContent className="p-4 flex-row items-start gap-3">
                        <View className="bg-red-500/10 p-2 rounded-xl">
                            <Icon as={ShieldAlertIcon} className="text-red-600 dark:text-red-400 size-6" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-bold text-red-700 dark:text-red-400">
                                System Maintenance Area
                            </Text>
                            <Text className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 leading-relaxed">
                                The actions on this page perform permanent deletions in the PostgreSQL database. Use with caution.
                            </Text>
                        </View>
                    </CardContent>
                </Card>

                {/* Action 1: Reset Marketplace */}
                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Marketplace Reset</Text>
                <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/40 shadow-sm mb-6">
                    <CardContent className="p-5">
                        <View className="flex-row items-start gap-3 mb-4">
                            <View className="bg-red-500/10 p-2.5 rounded-xl">
                                <Icon as={Trash2Icon} className="text-red-500 size-5" />
                            </View>
                            <View className="flex-1">
                                <Text className="font-bold text-base text-red-700 dark:text-red-400">Reset Marketplace &amp; Testing Records</Text>
                                <Text className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
                                    Permanently deletes all submitted apps, active match testing pairings, proofs, and chat messages. Real user profiles and streaks remain untouched.
                                </Text>
                            </View>
                        </View>
                        <Button
                            variant="destructive"
                            className="w-full rounded-xl flex-row gap-2"
                            onPress={() => setShowCleanConfirm(true)}
                            disabled={cleanAllAppsMutation.isPending}
                        >
                            {cleanAllAppsMutation.isPending ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <>
                                    <Icon as={Trash2Icon} className="size-4 text-white" />
                                    <Text className="text-white font-bold">Reset All Apps &amp; Testing Records</Text>
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Action 2: Clean Test Users */}
                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Dummy Test Accounts</Text>
                <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10 dark:border-orange-900/40 shadow-sm mb-6">
                    <CardContent className="p-5">
                        <View className="flex-row items-start gap-3 mb-4">
                            <View className="bg-orange-500/10 p-2.5 rounded-xl">
                                <Icon as={Trash2Icon} className="text-orange-500 size-5" />
                            </View>
                            <View className="flex-1">
                                <Text className="font-bold text-base text-orange-700 dark:text-orange-400">Purge Dummy Test Users</Text>
                                <Text className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-1">
                                    Deletes simulated QA and stress-testing accounts created during development. Your real admin accounts and verified Google users are completely protected.
                                </Text>
                            </View>
                        </View>
                        <Button
                            className="w-full bg-orange-600 hover:bg-orange-700 rounded-xl flex-row gap-2"
                            onPress={() => setShowCleanUsersConfirm(true)}
                            disabled={cleanTestUsersMutation.isPending}
                        >
                            {cleanTestUsersMutation.isPending ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                                <>
                                    <Icon as={Trash2Icon} className="size-4 text-white" />
                                    <Text className="text-white font-bold">Clean Dummy Test Users</Text>
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </ScrollView>

            {/* Confirm Clean All Apps */}
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

            {/* Confirm Clean Test Users */}
            <AlertDialog open={showCleanUsersConfirm} onOpenChange={setShowCleanUsersConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clean Dummy Test Accounts?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove simulated stress-testing and dummy test users from the database. Real admin and verified Google accounts will NOT be touched.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowCleanUsersConfirm(false)}>
                            <Text>Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onPress={handleCleanTestUsers}
                            className="bg-orange-600 hover:bg-orange-700"
                        >
                            <Text className="text-white font-bold">Yes, Clean Test Users</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
