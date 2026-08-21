import React, { useState } from 'react';
import { View, ScrollView, Image, TouchableOpacity, Modal, Share, Platform, Linking as RNLinking } from 'react-native';
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
import { toast } from '@/lib/sonner';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as IntentLauncher from 'expo-intent-launcher';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, CardContent } from '@/components/ui/card';
import {
    ArrowLeftIcon,
    SmartphoneIcon,
    ShareIcon,
    CheckCircleIcon,
    XIcon,
    Trash2Icon,
    EditIcon,
    UsersIcon,
    InfoIcon,
    PlayIcon,
    RocketIcon,
    FlagIcon,
    EyeIcon,
    EyeOffIcon,
    WrenchIcon,
} from 'lucide-react-native';
import { ReportDialog } from '@/components/ReportDialog';
import {
    useAppDetails,
    useMyApps,
    useCurrentUser,
    useMatches,
    useRequestMatch,
    useAcceptMatch,
    useRejectMatch,
    useUpdateApp,
    useVoteApp,
    MatchEntity,
} from '@/lib/api-hooks';

export default function AppDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const appId = id as string;

    // React Query hooks
    const { data: app, isLoading: isLoadingApp } = useAppDetails(appId);
    const { data: myAppsRaw = [] } = useMyApps();
    const { data: user } = useCurrentUser();
    const { data: allMatches = [] } = useMatches('all');

    const myApps = myAppsRaw.filter((a) => a.status !== 'completed');

    // Mutations
    const requestMatch = useRequestMatch();
    const acceptMatch = useAcceptMatch();
    const rejectMatch = useRejectMatch();
    const updateApp = useUpdateApp();
    const voteApp = useVoteApp();

    const [selectedMyApp, setSelectedMyApp] = useState<string | null>(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSentRequest, setHasSentRequest] = useState(false);
    const [activeAlert, setActiveAlert] = useState<null | 'no_apps' | 'reject' | 'complete' | 'delete'>(null);
    const [reportDialogVisible, setReportDialogVisible] = useState(false);

    // Find match for this app if exists
    const currentMatch = allMatches.find(
        (m: MatchEntity) =>
            (m.app1Id === appId || m.app2Id === appId) &&
            (m.user1Id === user?.id || m.user2Id === user?.id),
    );

    const isMine = user?.id && app?.userId === user.id;

    // Initial selection logic
    React.useEffect(() => {
        if (currentMatch) {
            const isUser1 = currentMatch.user1Id === user?.id;
            setSelectedMyApp(isUser1 ? currentMatch.app1Id : currentMatch.app2Id);
        } else if (myApps.length === 1 && !selectedMyApp) {
            setSelectedMyApp(myApps[0].id);
        }
    }, [myApps, currentMatch, user?.id]);

    const isLocked = currentMatch?.status === 'active' || currentMatch?.status === 'pending';

    const handleOpenApp = async () => {
        if (!app) return;
        const packageName = app.packageName;
        const marketUrl = `market://details?id=${packageName}`;
        const webUrl = app.playStoreUrl || `https://play.google.com/store/apps/details?id=${packageName}`;

        const openPlayStore = () => {
            RNLinking.canOpenURL(marketUrl).then((supported) => {
                if (supported) {
                    RNLinking.openURL(marketUrl);
                } else {
                    RNLinking.openURL(webUrl);
                }
            }).catch(() => {
                RNLinking.openURL(webUrl);
            });
        };

        if (Platform.OS === 'android') {
            try {
                // @ts-ignore
                await IntentLauncher.openApplication(packageName);
            } catch {
                openPlayStore();
            }
        } else {
            openPlayStore();
        }
    };

    const handleRequestSwap = async () => {
        if (!selectedMyApp) {
            if (myApps.length === 0) {
                setActiveAlert('no_apps');
                return;
            }
            setIsModalVisible(true);
            return;
        }

        const selectedApp = myApps.find((a) => a.id === selectedMyApp);
        if (selectedApp && (selectedApp.currentTesters >= selectedApp.requiredTesters || selectedApp.status === 'filled')) {
            toast.error('App Full', { description: 'Your selected app already has enough testers.' });
            return;
        }

        try {
            setIsSubmitting(true);
            await requestMatch.mutateAsync({
                targetAppId: appId,
                myAppId: selectedMyApp,
            });
            toast.success('Sent!', { description: 'Swap request sent.' });
            setHasSentRequest(true);
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to send request' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVoteVisibility = async (positive: boolean) => {
        try {
            await voteApp.mutateAsync({
                appId,
                type: positive ? 'positive' : 'negative',
            });
            toast.success('Thanks!', { description: 'Your feedback helps improve the marketplace.' });
        } catch (error: any) {
            toast.error('Error', { description: error.message });
        }
    };

    const handleAcceptRequest = async () => {
        if (!currentMatch?.id) return;
        try {
            setIsSubmitting(true);
            await acceptMatch.mutateAsync(currentMatch.id);
            toast.success('Accepted!', { description: 'Swap accepted! You can now start testing.' });
        } catch (error: any) {
            toast.error('Error', { description: 'Failed to accept swap.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRejectRequest = () => {
        if (!currentMatch?.id) return;
        setActiveAlert('reject');
    };

    const handleConfirmAction = async () => {
        const type = activeAlert;
        setActiveAlert(null);

        if (type === 'no_apps') {
            router.push('/add-app');
            return;
        }

        if (type === 'reject') {
            if (!currentMatch?.id) return;
            try {
                setIsSubmitting(true);
                await rejectMatch.mutateAsync(currentMatch.id);
                toast.success('Rejected');
            } catch (error: any) {
                toast.error('Error', { description: 'Failed to reject swap.' });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!app) return;

        if (type === 'complete') {
            try {
                setIsSubmitting(true);
                await updateApp.mutateAsync({
                    id: app.id,
                    status: 'completed',
                });
                toast.success('Congratulations!', {
                    description: `${app.title} marked as completed!\n\n+20 reputation earned!`,
                });
            } catch (err: any) {
                toast.error('Error', { description: err.message || 'Failed to mark as completed' });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (type === 'delete') {
            try {
                setIsSubmitting(true);
                await updateApp.mutateAsync({
                    id: app.id,
                    status: 'archived',
                });
                router.replace('/(tabs)/' as any);
            } catch (err: any) {
                toast.error('Error', { description: err.message });
            } finally {
                setIsSubmitting(false);
            }
            return;
        }
    };

    if (isLoadingApp || !app) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text>Loading app details...</Text>
            </SafeAreaView>
        );
    }

    const selectedAppData = myApps.find((a) => a.id === selectedMyApp);

    const handleShare = async () => {
        try {
            const shareUrl = `https://theclosedtest.neerajlovecyber.com/app/${appId}`;
            await Share.share({
                message: `Help me test "${app.title}" on TheClosedTest! Open this link to view details and request a swap: ${shareUrl}`,
                title: `Test ${app.title}`,
                url: shareUrl,
            });
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const isFilled = app.currentTesters >= app.requiredTesters || app.status === 'filled';

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center px-4 py-3 border-b border-border justify-between">
                <View className="flex-row items-center">
                    <Button variant="ghost" size="icon" onPress={() => router.back()}>
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </Button>
                    <Text className="text-lg font-bold ml-2">App Details</Text>
                </View>
                <View className="flex-row items-center gap-2">
                    <Button variant="ghost" size="icon" onPress={() => setReportDialogVisible(true)}>
                        <Icon as={FlagIcon} className="text-red-600 size-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onPress={handleShare}>
                        <Icon as={ShareIcon} className="text-foreground size-5" />
                    </Button>
                </View>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
                {/* App Header Card */}
                <View className="px-4 py-4 mb-2">
                    <Card className="border-0 overflow-hidden bg-blue-950 shadow-lg">
                        <CardContent className="p-0">
                            <View className="p-5 flex-row items-start gap-4">
                                <Image
                                    source={{ uri: app.iconUrl || 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=160&auto=format&fit=crop&q=80' }}
                                    className="w-20 h-20 rounded-2xl bg-background"
                                />
                                <View className="flex-1 gap-1">
                                    <View>
                                        <Text className="text-2xl font-bold text-white leading-tight" numberOfLines={2}>
                                            {app.title}
                                        </Text>
                                        <Text className="text-blue-100 text-sm" numberOfLines={1}>{app.packageName}</Text>
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleOpenApp}
                                        className="flex-row items-center bg-white px-3 py-1.5 rounded-full self-start mt-2"
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Icon as={PlayIcon} className="size-3.5 text-black mr-1.5" />
                                        <Text className="text-black font-bold text-xs">Open App</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View className="px-5 py-4 flex-row items-center justify-between border-t border-white/10">
                                <Text className="text-xs font-semibold text-blue-100 uppercase tracking-widest">
                                    Status
                                </Text>
                                <Text className="text-sm font-bold text-white uppercase">
                                    {app.status}
                                </Text>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                {/* Progress Section */}
                {app.status !== 'completed' && (
                    <View className="px-4 mb-6 gap-3">
                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-5 gap-3">
                                <View className="flex-row justify-between items-center">
                                    <Text className="font-semibold text-foreground">Progress</Text>
                                    <Text className="font-bold text-primary">{app.currentTesters || 0} / {app.requiredTesters} testers</Text>
                                </View>
                                <View className="h-3 bg-secondary rounded-full overflow-hidden w-full">
                                    <View
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${Math.min(100, ((app.currentTesters || 0) / Math.max(1, app.requiredTesters)) * 100)}%` }}
                                    />
                                </View>
                            </CardContent>
                        </Card>
                    </View>
                )}

                {/* Instructions Section */}
                <View className="px-4 mb-6 gap-3">
                    <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Instructions</Text>
                    <Card className="border-0 overflow-hidden">
                        <CardContent className="p-5">
                            <View className="flex-row gap-3">
                                <View className="mt-1">
                                    <Icon as={InfoIcon} className="size-5 text-blue-500" />
                                </View>
                                <Text className="text-foreground leading-relaxed flex-1 text-base">
                                    {app.instructions || 'No specific testing instructions provided by the developer.'}
                                </Text>
                            </View>
                        </CardContent>
                    </Card>
                </View>

                {/* Offer Section for Visitors */}
                {!isMine && (
                    <View className="px-4 mb-6 gap-3">
                        <Text className="text-xs font-bold text-muted-foreground px-2 uppercase tracking-widest">Your Offer</Text>
                        <Card className="border-0 overflow-hidden">
                            <CardContent className="p-0">
                                {selectedAppData ? (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        disabled={isLocked}
                                        onPress={() => setIsModalVisible(true)}
                                        className={`p-4 flex-row items-center gap-4 ${isLocked ? 'opacity-80' : ''}`}
                                    >
                                        <Image
                                            source={{ uri: selectedAppData.iconUrl || 'https://github.com/shadcn.png' }}
                                            className="w-12 h-12 rounded-xl bg-muted"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-bold text-base text-foreground">{selectedAppData.title}</Text>
                                            <Text className="text-xs text-muted-foreground">
                                                {isLocked ? 'Match Locked' : 'Tap to change app'}
                                            </Text>
                                        </View>
                                        <Icon as={CheckCircleIcon} className="text-green-500 size-6" />
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setIsModalVisible(true)}
                                        className="p-6 items-center justify-center bg-secondary/20"
                                    >
                                        <View className="h-12 w-12 rounded-full bg-primary/10 items-center justify-center mb-2">
                                            <Icon as={SmartphoneIcon} className="text-primary size-6" />
                                        </View>
                                        <Text className="font-semibold text-foreground">Select an App to Offer</Text>
                                        <Text className="text-xs text-muted-foreground text-center mt-1">
                                            You need to offer one of your apps for mutual testing
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </CardContent>
                        </Card>
                    </View>
                )}
            </ScrollView>

            {/* Action Footer */}
            <View className="p-4 border-t border-border bg-background safe-bottom">
                {isMine ? (
                    <View className="flex-row gap-4">
                        <Button
                            size="lg"
                            onPress={() => router.push({ pathname: '/edit-app', params: { id: app.id } } as any)}
                            className="flex-1 rounded-2xl shadow-sm"
                            disabled={isSubmitting}
                        >
                            <Icon as={EditIcon} className="size-4 text-white mr-2" />
                            <Text className="font-bold text-white">Edit</Text>
                        </Button>
                        <Button
                            size="lg"
                            variant="destructive"
                            onPress={() => setActiveAlert('delete')}
                            className="flex-1 rounded-2xl shadow-sm"
                            disabled={isSubmitting}
                        >
                            <Icon as={Trash2Icon} className="size-4 text-white mr-2" />
                            <Text className="font-bold text-white">Delete</Text>
                        </Button>
                    </View>
                ) : (
                    currentMatch?.status === 'active' ? (
                        <Button
                            size="lg"
                            className="w-full rounded-xl bg-green-600"
                            onPress={() => router.push({ pathname: '/(tabs)/match/[id]', params: { id: currentMatch.id } } as any)}
                        >
                            <Text className="font-bold text-lg text-white">Active Swap - Go to Details</Text>
                        </Button>
                    ) : currentMatch?.status === 'pending' || hasSentRequest ? (
                        <Button
                            size="lg"
                            variant="outline"
                            className="w-full rounded-xl opacity-80"
                            disabled={true}
                        >
                            <Text className="font-bold text-lg">Swap Pending</Text>
                        </Button>
                    ) : isFilled ? (
                        <View className="w-full py-4 items-center justify-center bg-red-100 dark:bg-red-900/30 rounded-xl">
                            <Text className="text-red-600 dark:text-red-400 font-bold text-lg">Filled - Not Accepting Requests</Text>
                        </View>
                    ) : (
                        <Button
                            size="lg"
                            onPress={handleRequestSwap}
                            className="w-full rounded-xl"
                            disabled={isSubmitting}
                        >
                            <Text className="font-bold text-lg">
                                {isSubmitting ? 'Sending Request...' : 'Start Testing Together'}
                            </Text>
                        </Button>
                    )
                )}
            </View>

            {/* App Selection Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setIsModalVisible(false)}
            >
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[50%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold">Select App</Text>
                            <Button variant="ghost" size="icon" onPress={() => setIsModalVisible(false)}>
                                <Icon as={XIcon} className="size-6" />
                            </Button>
                        </View>

                        {myApps.length === 0 ? (
                            <View className="items-center py-10 gap-4">
                                <Text className="text-muted-foreground text-center">You haven't added any apps yet.</Text>
                                <Button onPress={() => { setIsModalVisible(false); router.push('/add-app'); }}>
                                    <Text>Add New App</Text>
                                </Button>
                            </View>
                        ) : (
                            <ScrollView>
                                {myApps.map((myapp) => (
                                    <TouchableOpacity
                                        key={myapp.id}
                                        className={`flex-row items-center gap-4 p-4 mb-3 rounded-xl border ${selectedMyApp === myapp.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                                        onPress={() => {
                                            setSelectedMyApp(myapp.id);
                                            setIsModalVisible(false);
                                        }}
                                    >
                                        <Image
                                            source={{ uri: myapp.iconUrl || 'https://github.com/shadcn.png' }}
                                            className="w-12 h-12 rounded-lg bg-muted"
                                        />
                                        <View className="flex-1">
                                            <Text className="font-bold text-lg">{myapp.title}</Text>
                                            <Text className="text-muted-foreground text-sm">{myapp.currentTesters} / {myapp.requiredTesters} testers</Text>
                                        </View>
                                        {selectedMyApp === myapp.id && (
                                            <Icon as={CheckCircleIcon} className="text-primary size-5" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            <ReportDialog
                visible={reportDialogVisible}
                onClose={() => setReportDialogVisible(false)}
                reportType="app"
                targetId={appId}
                reportedAppId={appId}
                targetName={app.title}
            />

            <AlertDialog open={!!activeAlert} onOpenChange={(open) => !open && setActiveAlert(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {activeAlert === 'no_apps' && 'No Apps Found'}
                            {activeAlert === 'reject' && 'Reject Request'}
                            {activeAlert === 'complete' && '🚀 Mark as Completed?'}
                            {activeAlert === 'delete' && 'Delete App'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {activeAlert === 'no_apps' && 'You need to add an app first to request a swap.'}
                            {activeAlert === 'reject' && 'Are you sure you want to reject this request?'}
                            {activeAlert === 'complete' && 'This will mark your testing as completed!'}
                            {activeAlert === 'delete' && 'Are you sure? This will remove your app from testing.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setActiveAlert(null)}>
                            <Text className="font-bold text-foreground">Cancel</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onPress={handleConfirmAction}
                            className={activeAlert === 'reject' || activeAlert === 'delete' ? 'bg-destructive' : ''}
                        >
                            <Text className={activeAlert === 'reject' || activeAlert === 'delete' ? 'text-white font-bold' : 'font-bold'}>
                                {activeAlert === 'no_apps' ? 'Add App' : (activeAlert === 'reject' ? 'Reject' : (activeAlert === 'delete' ? 'Delete' : 'Confirm'))}
                            </Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SafeAreaView>
    );
}
