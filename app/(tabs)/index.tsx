import React, { useState } from 'react';
import { View, ScrollView, RefreshControl, Image, TouchableOpacity, Alert } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { PendingRequestCard } from '@/components/PendingRequestCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { BellIcon, ActivityIcon, CheckCircleIcon, FlameIcon, StarIcon, PlusIcon, ArrowRightIcon } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
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

export default function HomeScreen() {
    const { user } = useUser();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    const [requestToReject, setRequestToReject] = useState<Id<"matches"> | null>(null);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

    // Convex Data
    const incomingRequests = useQuery(api.matches.getIncomingRequests) || [];
    const myApps = useQuery(api.apps.getMyApps) || [];

    // Mutations
    const acceptSwap = useMutation(api.matches.acceptSwap);
    const rejectSwap = useMutation(api.matches.rejectSwap);

    // Dummy Data for fallback (Stats)
    const userName = user?.firstName || "Tester";
    const reputation = 100;
    const streak = 5;
    const dueTasks = [
        { id: 1, appName: "Flappy Bird 2", owner: "John Doe", dueIn: "4 hours" },
        { id: 2, appName: "Crypto Tracker", owner: "Jane Smith", dueIn: "6 hours" }
    ];

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        // Convex queries auto-update, but good for UI feel
        setTimeout(() => setRefreshing(false), 1000);
    }, []);

    const handleAccept = async (matchId: any) => {
        try {
            await acceptSwap({ matchId });
            Alert.alert("Success", "Swap accepted! You can now start testing.");
        } catch (error: any) {
            Alert.alert("Error", "Failed to accept swap.");
        }
    };



    const handleReject = (matchId: any) => {
        setRequestToReject(matchId);
        setIsRejectDialogOpen(true);
    };

    const confirmReject = async () => {
        if (!requestToReject) return;
        try {
            await rejectSwap({ matchId: requestToReject });
            // Optional: Toast or success message
        } catch (error: any) {
            Alert.alert("Error", "Failed to reject swap.");
        } finally {
            setIsRejectDialogOpen(false);
            setRequestToReject(null);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Header Section */}
                <View className="px-6 py-8 bg-card border-b border-border">
                    <View className="flex-row justify-between items-start mb-4">
                        <View>
                            <Text className="text-3xl font-bold text-foreground">Hello, {userName}!</Text>
                            <Text className="text-muted-foreground text-lg">Let's squash some bugs today.</Text>
                        </View>
                        <Button variant="outline" size="icon">
                            <Icon as={BellIcon} className="text-foreground" />
                        </Button>
                    </View>

                    <View className="flex-row gap-4 mt-2">
                        <Card className="flex-1 bg-primary/10 border-primary/20">
                            <CardContent className="p-4 items-center">
                                <Icon as={StarIcon} className="text-primary mb-2 size-6" />
                                <Text className="font-bold text-2xl text-primary">{reputation}</Text>
                                <Text className="text-xs text-muted-foreground uppercase font-bold">Reputation</Text>
                            </CardContent>
                        </Card>
                        <Card className="flex-1 bg-orange-500/10 border-orange-500/20">
                            <CardContent className="p-4 items-center">
                                <Icon as={FlameIcon} className="text-orange-500 mb-2 size-6" />
                                <Text className="font-bold text-2xl text-orange-500">{streak}</Text>
                                <Text className="text-xs text-muted-foreground uppercase font-bold">Details Streak</Text>
                            </CardContent>
                        </Card>
                    </View>
                </View>

                {/* Pending Requests Section */}
                {incomingRequests.length > 0 && (
                    <View className="pt-6">
                        <Text className="text-xl font-bold mb-4 text-primary px-6">Pending Requests</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            className="pb-2"
                            contentContainerStyle={{ paddingHorizontal: 24 }}
                        >
                            {incomingRequests.map((req: any) => (
                                <PendingRequestCard
                                    key={req._id}
                                    request={req}
                                    onAccept={handleAccept}
                                    onReject={handleReject}
                                    onAppPress={(appId) => router.push(`/app-details/${appId}`)}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Attention Needed Section */}
                <View className="p-6">
                    <Text className="text-xl font-bold mb-4">Attention Needed</Text>

                    {dueTasks.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4">
                            {dueTasks.map(task => (
                                <View key={task.id} className="w-80 mr-4">
                                    <AppCard
                                        item={{
                                            _id: String(task.id),
                                            title: task.appName,
                                            ownerName: task.owner,
                                            dueIn: task.dueIn
                                        }}
                                        variant="testing"
                                        onPress={() => router.push(`/app-details/${task.id}`)}
                                    />
                                </View>
                            ))}
                        </ScrollView>
                    ) : (
                        <View className="p-6 bg-secondary rounded-xl items-center">
                            <Icon as={CheckCircleIcon} className="text-green-500 mb-2 size-8" />
                            <Text className="font-medium">You're all caught up!</Text>
                        </View>
                    )}
                </View>

                {/* My Apps Overview */}
                <View className="px-6 pb-20">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-xl font-bold">My Apps</Text>
                        <TouchableOpacity
                            className="flex-row items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-full"
                            onPress={() => router.push('/add-app')}
                        >
                            <Icon as={PlusIcon} className="text-primary size-4" />
                            <Text className="text-primary font-bold text-xs uppercase">New App</Text>
                        </TouchableOpacity>
                    </View>

                    {myApps.length > 0 ? (
                        myApps.map((app) => (
                            <AppCard
                                key={app._id}
                                item={app}
                                variant="my-app"
                                onPress={undefined}
                            />
                        ))
                    ) : (
                        <View className="items-center py-8 bg-muted/10 rounded-xl border border-dashed border-muted-foreground/20">
                            <Text className="text-muted-foreground mb-4">You haven't added any apps yet.</Text>
                            <Button variant="outline" onPress={() => router.push('/add-app')}>
                                <Text>Add Your First App</Text>
                            </Button>
                        </View>
                    )}
                </View>
            </ScrollView >

            <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Request</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to reject this swap request? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => setIsRejectDialogOpen(false)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onPress={confirmReject} className="bg-destructive">
                            <Text className="text-white">Reject</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </View>
    );
}
