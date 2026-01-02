import React, { useState } from 'react';
import { View, ScrollView, RefreshControl, Image, TouchableOpacity } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { BellIcon, ActivityIcon, CheckCircleIcon, FlameIcon, StarIcon } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
    const { user } = useUser();
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);

    // Dummy Data
    const userName = user?.firstName || "Tester";
    const reputation = 100;
    const streak = 5;
    const dueTasks = [
        { id: 1, appName: "Flappy Bird 2", owner: "John Doe", dueIn: "4 hours" },
        { id: 2, appName: "Crypto Tracker", owner: "Jane Smith", dueIn: "6 hours" }
    ];
    const myApps = [
        { id: 1, name: "My Awesome Game", testers: 8, maxTesters: 12 },
    ];

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 2000);
    }, []);

    return (
        <ScrollView
            className="flex-1 bg-background"
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
                    <Button variant="ghost" size="sm">
                        <Text className="text-primary">View All</Text>
                    </Button>
                </View>

                {myApps.map(app => (
                    <AppCard
                        key={app.id}
                        item={{
                            _id: String(app.id),
                            title: app.name,
                            currentTesters: app.testers,
                            requiredTesters: app.maxTesters,
                            status: 'recruiting' // defaulting for demo
                        }}
                        variant="my-app"
                        onPress={() => { }}
                    />
                ))}
            </View>
        </ScrollView>
    );
}
