import React, { useState, useMemo } from 'react';
import { View, FlatList, TouchableOpacity, RefreshControl, Image, TextInput, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import {
    ArrowLeftIcon,
    SearchIcon,
    Trash2Icon,
    AlertTriangleIcon,
    CheckCircleIcon,
    LayersIcon,
    ExternalLinkIcon,
    ShieldAlertIcon,
    SparklesIcon,
} from 'lucide-react-native';
import { toast } from '@/lib/sonner';
import { useAdminApps, useAdminDeleteApp, useAdminCleanDuplicates, AppEntity } from '@/lib/api-hooks';
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

export default function AdminAppsListScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

    // Selected app for delete confirmation
    const [selectedApp, setSelectedApp] = useState<(AppEntity & { isDuplicate?: boolean }) | null>(null);
    const [banPackageOnDelete, setBanPackageOnDelete] = useState(false);
    const [showCleanDuplicatesModal, setShowCleanDuplicatesModal] = useState(false);

    const { data: appsResponse, isLoading, refetch, isRefetching } = useAdminApps(
        searchQuery || undefined,
        statusFilter === 'all' ? undefined : statusFilter,
        100,
        0,
    );

    const deleteAppMutation = useAdminDeleteApp();
    const cleanDuplicatesMutation = useAdminCleanDuplicates();

    const allApps = appsResponse?.apps || [];
    const duplicatePackagesCount = appsResponse?.duplicatePackagesCount || 0;

    const filteredApps = useMemo(() => {
        if (!showDuplicatesOnly) return allApps;
        return allApps.filter((a) => a.isDuplicate);
    }, [allApps, showDuplicatesOnly]);

    const handleDeleteApp = async () => {
        if (!selectedApp) return;
        try {
            const res = await deleteAppMutation.mutateAsync({
                appId: selectedApp.id,
                banPackage: banPackageOnDelete,
                reason: banPackageOnDelete ? 'Banned by Admin for duplicate spam' : undefined,
            });
            toast.success('App Deleted', {
                description: res.message || `"${selectedApp.title}" was removed.`,
            });
            setSelectedApp(null);
            setBanPackageOnDelete(false);
        } catch (error: any) {
            toast.error('Deletion Failed', {
                description: error.message || 'Could not delete app.',
            });
        }
    };

    const handleCleanDuplicates = async () => {
        try {
            const res = await cleanDuplicatesMutation.mutateAsync();
            toast.success('Duplicates Cleaned', {
                description: res.message || `Cleaned ${res.deletedAppsCount} duplicate apps.`,
            });
            setShowCleanDuplicatesModal(false);
        } catch (error: any) {
            toast.error('Cleanup Failed', {
                description: error.message || 'Could not clean duplicate apps.',
            });
        }
    };

    const renderAppItem = ({ item }: { item: AppEntity & { isDuplicate?: boolean } }) => {
        const ownerName = item.user?.name || item.user?.email?.split('@')[0] || 'Unknown';
        const ownerEmail = item.user?.email || 'No email';
        const rep = item.user?.reputation ?? 100;
        const isFilled = item.status === 'filled';
        const isRecruiting = item.status === 'recruiting';

        return (
            <Card className={`mb-3 border-border shadow-sm overflow-hidden ${item.isDuplicate ? 'border-amber-400 dark:border-amber-500/50 bg-amber-500/5' : 'bg-card'}`}>
                <CardContent className="p-4">
                    {/* Header Row: Icon + Title + Status */}
                    <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-row items-center gap-3 flex-1">
                            {item.iconUrl ? (
                                <Image
                                    source={{ uri: item.iconUrl }}
                                    className="w-12 h-12 rounded-xl bg-muted"
                                />
                            ) : (
                                <View className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center">
                                    <Icon as={LayersIcon} className="size-6 text-primary" />
                                </View>
                            )}

                            <View className="flex-1">
                                <View className="flex-row items-center gap-1.5 flex-wrap">
                                    <Text className="font-bold text-foreground text-base" numberOfLines={1}>
                                        {item.title}
                                    </Text>
                                    {item.isDuplicate && (
                                        <View className="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700/50">
                                            <Text className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                                                Duplicate Package
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text className="text-xs text-muted-foreground font-mono mt-0.5" numberOfLines={1}>
                                    {item.packageName}
                                </Text>
                            </View>
                        </View>

                        {/* Status Badge */}
                        <View
                            className={`px-2.5 py-1 rounded-full ${
                                isRecruiting
                                    ? 'bg-blue-100 dark:bg-blue-900/30'
                                    : isFilled
                                    ? 'bg-purple-100 dark:bg-purple-900/30'
                                    : 'bg-muted'
                            }`}
                        >
                            <Text
                                className={`text-[10px] font-bold uppercase tracking-wider ${
                                    isRecruiting
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : isFilled
                                        ? 'text-purple-700 dark:text-purple-400'
                                        : 'text-muted-foreground'
                                }`}
                            >
                                {item.status}
                            </Text>
                        </View>
                    </View>

                    {/* Developer Info & Testers Info */}
                    <View className="mt-3 pt-3 border-t border-border flex-row items-center justify-between text-xs">
                        <View className="flex-1 mr-2">
                            <Text className="text-xs text-foreground font-semibold" numberOfLines={1}>
                                Dev: {ownerName} <Text className="text-muted-foreground font-normal">({ownerEmail})</Text>
                            </Text>
                            <Text className="text-[11px] text-muted-foreground mt-0.5">
                                Rep: <Text className="font-bold text-foreground">{rep}</Text> • Created: {new Date(item.createdAt).toLocaleDateString()}
                            </Text>
                        </View>

                        <View className="items-end">
                            <Text className="text-xs font-bold text-foreground">
                                {item.currentTesters}/{item.requiredTesters} Testers
                            </Text>
                        </View>
                    </View>

                    {/* Actions Row */}
                    <View className="mt-3 pt-2.5 border-t border-border/50 flex-row justify-end items-center gap-2">
                        <TouchableOpacity
                            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary"
                            onPress={() => router.push({ pathname: '/app-details/[id]', params: { id: item.id } } as any)}
                        >
                            <Icon as={ExternalLinkIcon} className="size-3.5 text-secondary-foreground" />
                            <Text className="text-xs font-semibold text-secondary-foreground">View Details</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 dark:bg-red-600 active:opacity-80"
                            onPress={() => {
                                setBanPackageOnDelete(false);
                                setSelectedApp(item);
                            }}
                            activeOpacity={0.7}
                        >
                            <Icon as={Trash2Icon} className="size-3.5 text-white" />
                            <Text className="text-xs font-bold text-white">Delete App</Text>
                        </TouchableOpacity>
                    </View>
                </CardContent>
            </Card>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Top Navigation Bar */}
            <View className="px-5 py-4 border-b border-border bg-card/60 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-10 h-10 rounded-full bg-secondary/80 items-center justify-center active:opacity-60"
                        activeOpacity={0.7}
                    >
                        <Icon as={ArrowLeftIcon} className="size-5 text-foreground" />
                    </TouchableOpacity>
                    <View className="flex-1">
                        <Text className="text-xl font-extrabold text-foreground tracking-tight">App Management</Text>
                        <Text className="text-xs text-muted-foreground font-medium mt-0.5">Search, inspect &amp; remove apps</Text>
                    </View>
                </View>

                {duplicatePackagesCount > 0 && (
                    <TouchableOpacity
                        onPress={() => setShowCleanDuplicatesModal(true)}
                        className="flex-row items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 rounded-full"
                        activeOpacity={0.7}
                    >
                        <Icon as={SparklesIcon} className="size-3.5 text-amber-600 dark:text-amber-400" />
                        <Text className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            Clean {duplicatePackagesCount} Dups
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Search Input */}
            <View className="px-4 pt-4 pb-2">
                <View className="flex-row items-center bg-card border border-border rounded-2xl px-3.5 h-12 shadow-sm">
                    <Icon as={SearchIcon} className="size-4 text-muted-foreground mr-2.5" />
                    <TextInput
                        placeholder="Search app title, package, dev name or email..."
                        placeholderTextColor="#888"
                        className="flex-1 text-sm text-foreground py-2"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>

            {/* Filter Chips */}
            <View className="flex-row px-4 py-2 gap-2 items-center flex-wrap">
                <TouchableOpacity
                    onPress={() => {
                        setShowDuplicatesOnly(false);
                        setStatusFilter('all');
                    }}
                    className={`px-3 py-1 rounded-full border ${!showDuplicatesOnly && statusFilter === 'all' ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                >
                    <Text className={`text-xs font-semibold ${!showDuplicatesOnly && statusFilter === 'all' ? 'text-primary-foreground' : 'text-foreground'}`}>
                        All ({allApps.length})
                    </Text>
                </TouchableOpacity>

                {duplicatePackagesCount > 0 && (
                    <TouchableOpacity
                        onPress={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                        className={`px-3 py-1 rounded-full border flex-row items-center gap-1 ${showDuplicatesOnly ? 'bg-amber-500 border-amber-500' : 'bg-amber-500/10 border-amber-500/30'}`}
                    >
                        <Icon as={AlertTriangleIcon} className={`size-3 ${showDuplicatesOnly ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`} />
                        <Text className={`text-xs font-bold ${showDuplicatesOnly ? 'text-white' : 'text-amber-700 dark:text-amber-400'}`}>
                            Duplicates Only ({duplicatePackagesCount})
                        </Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    onPress={() => {
                        setShowDuplicatesOnly(false);
                        setStatusFilter(statusFilter === 'recruiting' ? 'all' : 'recruiting');
                    }}
                    className={`px-3 py-1 rounded-full border ${statusFilter === 'recruiting' ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                >
                    <Text className={`text-xs font-semibold ${statusFilter === 'recruiting' ? 'text-primary-foreground' : 'text-foreground'}`}>
                        Recruiting
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => {
                        setShowDuplicatesOnly(false);
                        setStatusFilter(statusFilter === 'filled' ? 'all' : 'filled');
                    }}
                    className={`px-3 py-1 rounded-full border ${statusFilter === 'filled' ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                >
                    <Text className={`text-xs font-semibold ${statusFilter === 'filled' ? 'text-primary-foreground' : 'text-foreground'}`}>
                        Filled
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Apps List */}
            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" />
                    <Text className="text-xs text-muted-foreground mt-2">Loading apps...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredApps}
                    keyExtractor={(item) => item.id}
                    renderItem={renderAppItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-16">
                            <Icon as={CheckCircleIcon} className="size-10 text-muted-foreground mb-2" />
                            <Text className="text-base font-bold text-foreground">No apps found</Text>
                            <Text className="text-xs text-muted-foreground mt-1 text-center px-6">
                                {searchQuery ? `No apps matching "${searchQuery}"` : 'There are currently no apps matching this filter.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Delete Single App Alert Dialog */}
            <AlertDialog open={Boolean(selectedApp)} onOpenChange={(open) => !open && setSelectedApp(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete App?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to permanently delete "{selectedApp?.title}" ({selectedApp?.packageName})?
                            {"\n\n"}This will cancel any active test matches and delete associated proofs for this app.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {/* Ban Package Option */}
                    <TouchableOpacity
                        className="flex-row items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 my-2"
                        onPress={() => setBanPackageOnDelete(!banPackageOnDelete)}
                        activeOpacity={0.7}
                    >
                        <View className={`w-5 h-5 rounded border items-center justify-center ${banPackageOnDelete ? 'bg-red-600 border-red-600' : 'border-red-400'}`}>
                            {banPackageOnDelete && <Icon as={CheckCircleIcon} className="size-3.5 text-white" />}
                        </View>
                        <View className="flex-1">
                            <Text className="text-xs font-bold text-red-700 dark:text-red-300">
                                Also ban this package name
                            </Text>
                            <Text className="text-[10px] text-red-600/80 dark:text-red-400/80">
                                Prevents anyone from uploading this package again
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setSelectedApp(null)}>
                            <Text className="text-foreground font-semibold">Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 dark:bg-red-600 active:bg-red-700"
                            onPress={handleDeleteApp}
                        >
                            <Text className="text-white font-bold">
                                {deleteAppMutation.isPending ? 'Deleting...' : 'Delete App'}
                            </Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Clean All Duplicates Alert Dialog */}
            <AlertDialog open={showCleanDuplicatesModal} onOpenChange={setShowCleanDuplicatesModal}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clean All Duplicate Apps?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will scan all registered apps and keep only the **earliest created active app** for each package name.
                            {"\n\n"}All subsequent duplicates and their associated test records will be permanently removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setShowCleanDuplicatesModal(false)}>
                            <Text className="text-foreground font-semibold">Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-amber-600 dark:bg-amber-600 active:bg-amber-700"
                            onPress={handleCleanDuplicates}
                        >
                            <Text className="text-white font-bold">
                                {cleanDuplicatesMutation.isPending ? 'Cleaning...' : 'Clean Duplicates Now'}
                            </Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SafeAreaView>
    );
}
