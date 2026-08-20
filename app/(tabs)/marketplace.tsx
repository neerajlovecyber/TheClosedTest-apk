import React, { useState, useRef, useCallback, useMemo, memo } from 'react';
import { View, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator } from 'react-native';
import { LegendList } from '@legendapp/list';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { Modal, Pressable, Linking } from 'react-native';
import { SearchIcon, CheckCircleIcon, UsersIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/AppCard';
import { GoogleGroupWidget } from '@/components/GoogleGroupWidget';
import { ReportDialog } from '@/components/ReportDialog';
import { Alert } from 'react-native';
import { useCurrentUser, useRecruitingApps, useMatches, MatchEntity, AppEntity } from '@/lib/api-hooks';

export default function MarketplaceScreen() {
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const [showReportDialog, setShowReportDialog] = useState(false);
    const [reportApp, setReportApp] = useState<any>(null);
    const [showGroupModal, setShowGroupModal] = useState(false);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    });

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50
    });

    // API Queries
    const { data: user } = useCurrentUser();
    const { data: appsData, isLoading } = useRecruitingApps(searchQuery || undefined, 50, 0);
    const { data: allMatches = [] } = useMatches('all');

    const apps = appsData?.apps || [];

    const matchStatusMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of allMatches) {
            if (m.app1Id) map.set(m.app1Id, m.status);
            if (m.app2Id) map.set(m.app2Id, m.status);
        }
        return map;
    }, [allMatches]);

    const latestOpportunities = useMemo(() => {
        return apps
            .filter((app: AppEntity) => app.status === 'recruiting' && app.currentTesters < app.requiredTesters)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 16);
    }, [apps]);

    const groupedRecruiting = useMemo(() => {
        const chunked = [];
        const arr = latestOpportunities || [];
        for (let i = 0; i < arr.length; i += 4) {
            chunked.push(arr.slice(i, i + 4));
        }
        return chunked;
    }, [latestOpportunities]);

    const handleAppPress = useCallback((appId: string) => {
        router.push({ pathname: "/app-details/[id]", params: { id: appId, source: 'marketplace' } } as any);
    }, [router]);

    const handleReportApp = useCallback((app: any) => {
        setReportApp(app);
        Alert.alert(
            "Report App",
            `Do you want to report "${app.title}"?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Report",
                    onPress: () => setShowReportDialog(true)
                }
            ]
        );
    }, []);

    const renderAppItem = useCallback(({ item }: { item: AppEntity }) => (
        <AppCard
            key={item.id}
            item={{
                _id: item.id,
                title: item.title,
                iconUrl: item.iconUrl,
                currentTesters: item.currentTesters,
                requiredTesters: item.requiredTesters,
                status: item.status,
                reputation: item.user?.reputation,
            }}
            onPress={() => handleAppPress(item.id)}
            onReport={() => handleReportApp(item)}
            matchStatus={matchStatusMap.get(item.id)}
        />
    ), [handleAppPress, matchStatusMap, handleReportApp]);

    const keyExtractor = useCallback((item: AppEntity) => item.id, []);

    const renderGroupItem = useCallback(({ item: group }: { item: AppEntity[] }) => (
        <View style={{ width: windowWidth * 0.85 }} className="mr-4">
            {group.map((app: AppEntity) => (
                <AppCard
                    key={app.id}
                    item={{
                        _id: app.id,
                        title: app.title,
                        iconUrl: app.iconUrl,
                        currentTesters: app.currentTesters,
                        requiredTesters: app.requiredTesters,
                        status: app.status,
                        reputation: app.user?.reputation,
                    }}
                    onPress={() => handleAppPress(app.id)}
                    onReport={() => handleReportApp(app)}
                    matchStatus={matchStatusMap.get(app.id)}
                />
            ))}
        </View>
    ), [windowWidth, handleAppPress, matchStatusMap, handleReportApp]);

    const groupKeyExtractor = useCallback((item: AppEntity[], index: number) => `group-${index}`, []);

    return (
        <View className="flex-1 bg-background">
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
                <View className="gap-3">
                    <View className="mb-0 flex-row justify-between items-start">
                        <View>
                            <Text className="text-3xl font-extrabold text-foreground tracking-tight">Marketplace</Text>
                            <Text className="text-sm text-muted-foreground font-medium mt-0.5">Find apps, swap tests, get published.</Text>
                        </View>
                        <View className="flex-row gap-2">
                            {user?.googleGroupConfirmed && (
                                <TouchableOpacity
                                    onPress={() => setShowGroupModal(true)}
                                    className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center border border-green-500/20"
                                    activeOpacity={0.7}
                                >
                                    <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-5" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={() => router.push('/help' as any)}
                                className="w-10 h-10 rounded-full bg-orange-500/10 items-center justify-center border border-orange-500/20"
                                activeOpacity={0.7}
                            >
                                <Text className="text-orange-600 dark:text-orange-400 text-xl font-bold">?</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {user && !user.googleGroupConfirmed && <GoogleGroupWidget className="mb-0" />}

                    {/* Search Bar */}
                    <View className="relative">
                        <View className="absolute left-3 top-3 z-10">
                            <Icon as={SearchIcon} className="size-4 text-muted-foreground" />
                        </View>
                        <Input
                            placeholder="Find specific apps..."
                            className="pl-9 h-10 bg-card border-border shadow-sm text-foreground"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {/* Recruiting Now / Latest */}
                    {!searchQuery && (
                        <View>
                            <Text className="text-lg font-bold px-1 mb-3">Latest Opportunities</Text>
                            {groupedRecruiting.length > 0 ? (
                                <View>
                                    <LegendList
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        data={groupedRecruiting}
                                        keyExtractor={groupKeyExtractor}
                                        snapToInterval={windowWidth * 0.85 + 16}
                                        decelerationRate="fast"
                                        snapToAlignment="start"
                                        onViewableItemsChanged={onViewableItemsChanged.current}
                                        viewabilityConfig={viewabilityConfig.current}
                                        contentContainerStyle={{ paddingRight: 16 }}
                                        renderItem={renderGroupItem}
                                        recycleItems
                                        estimatedItemSize={windowWidth * 0.85}
                                    />
                                    <View className="flex-row justify-center mt-2 gap-2">
                                        {groupedRecruiting.map((_, index) => (
                                            <View
                                                key={index}
                                                className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'}`}
                                            />
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                <View className="items-center py-4">
                                    <Text className="text-muted-foreground">No new apps available yet.</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* All Apps */}
                    <View>
                        <Text className="text-lg font-bold px-1 mb-3">{searchQuery ? 'Search Results' : 'All Apps'}</Text>
                        {apps.length > 0 ? (
                            <LegendList
                                data={apps}
                                keyExtractor={keyExtractor}
                                renderItem={renderAppItem}
                                recycleItems
                                estimatedItemSize={120}
                                scrollEnabled={false}
                            />
                        ) : (
                            <View className="items-center py-10">
                                {isLoading ? (
                                    <ActivityIndicator size="small" />
                                ) : (
                                    <Text className="text-muted-foreground">No apps found.</Text>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Google Group Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showGroupModal}
                onRequestClose={() => setShowGroupModal(false)}
            >
                <Pressable
                    className="flex-1 justify-end bg-black/50"
                    onPress={() => setShowGroupModal(false)}
                >
                    <Pressable className="bg-background rounded-t-3xl p-6">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                                <Icon as={UsersIcon} className="size-6 text-green-600 dark:text-green-400" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-xl font-bold text-foreground">Google Group</Text>
                                <Text className="text-sm text-muted-foreground">Community Member</Text>
                            </View>
                        </View>

                        <Text className="text-muted-foreground mb-4">
                            You're a verified member of our developer community Google Group.
                        </Text>

                        <Button
                            size="lg"
                            className="bg-green-600 dark:bg-green-600"
                            onPress={() => {
                                Linking.openURL("https://groups.google.com/g/developers-community-official");
                                setShowGroupModal(false);
                            }}
                        >
                            <Text className="text-white font-bold">Open Google Group</Text>
                        </Button>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Report Dialog */}
            {reportApp && (
                <ReportDialog
                    visible={showReportDialog}
                    onClose={() => setShowReportDialog(false)}
                    reportType="app"
                    targetId={reportApp.id}
                    reportedAppId={reportApp.id}
                    targetName={reportApp.title}
                />
            )}
        </View>
    );
}
