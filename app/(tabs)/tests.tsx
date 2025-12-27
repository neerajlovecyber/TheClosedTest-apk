import React, { useState } from 'react';
import { View, FlatList, TouchableOpacity, Image } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, ClockIcon, FlaskConicalIcon, PlusIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function TestsScreen() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'testing' | 'my_apps'>('testing');

    // Dummy Data
    const testingApps = [
        { id: '1', name: "Super Calc", status: "pending", day: 5, totalDays: 14, owner: "Mike" },
        { id: '2', name: "Fitness Pro", status: "completed", day: 12, totalDays: 14, owner: "Sarah" },
        { id: '3', name: "Bird Watcher", status: "pending", day: 1, totalDays: 14, owner: "Tom" },
    ];

    const myApps = [
        { id: '101', name: "My Game", testers: 12, required: 12, status: "filled" },
        { id: '102', name: "My Utility", testers: 4, required: 12, status: "recruiting" },
    ];

    const renderTestingItem = ({ item }: { item: any }) => (
        <Card className="mb-3">
            <CardContent className="flex-row gap-4">
                <Image
                    source={{ uri: 'https://github.com/shadcn.png' }}
                    className="size-20 rounded-xl bg-muted border border-border"
                />
                <View className="flex-1 justify-between py-0.5">
                    <View className="flex-row justify-between items-start">
                        <Text className="font-bold text-lg leading-tight flex-1 mr-2">{item.name}</Text>
                        {item.status !== 'completed' && (
                            <View className="bg-destructive/10 px-2 py-0.5 rounded-full">
                                <Text className="text-[10px] text-destructive font-bold uppercase">Due Today</Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-muted-foreground text-sm">Owner: {item.owner}</Text>
                    <View className="flex-row items-center gap-1.5 mt-1">
                        <Icon as={ClockIcon} className="size-3.5 text-muted-foreground" />
                        <Text className="text-xs font-medium text-muted-foreground">Day {item.day} of {item.totalDays}</Text>
                    </View>
                </View>
            </CardContent>
        </Card>
    );

    const renderMyAppItem = ({ item }: { item: any }) => (
        <Card className="mb-3">
            <CardContent className="flex-row gap-4">
                <Image
                    source={{ uri: 'https://github.com/shadcn.png' }}
                    className="size-20 rounded-xl bg-muted border border-border"
                />
                <View className="flex-1 justify-between py-0.5">
                    <View className="flex-row justify-between items-start">
                        <Text className="font-bold text-lg leading-tight flex-1 mr-2">{item.name}</Text>
                        <View className={`px-2 py-0.5 rounded-full ${item.status === 'filled' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary/10'}`}>
                            <Text className={`text-[10px] font-bold uppercase ${item.status === 'filled' ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}>{item.status}</Text>
                        </View>
                    </View>

                    <Text className="text-muted-foreground text-sm">
                        {item.testers} / {item.required} Testers Joined
                    </Text>

                    <View className="h-2 bg-secondary rounded-full mt-2 overflow-hidden w-full">
                        <View className="h-full bg-primary" style={{ width: `${(item.testers / item.required) * 100}%` }} />
                    </View>
                </View>
            </CardContent>
        </Card>
    );

    return (
        <View className="flex-1 bg-background">
            <View className="p-4 bg-background border-b border-border">
                <View className="flex-row bg-muted rounded-lg p-1">
                    <TouchableOpacity
                        className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'testing' ? 'bg-background shadow-sm' : ''}`}
                        onPress={() => setActiveTab('testing')}
                    >
                        <Text className={`font-medium ${activeTab === 'testing' ? 'text-foreground' : 'text-muted-foreground'}`}>I'm Testing</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        className={`flex-1 py-1.5 rounded-md items-center ${activeTab === 'my_apps' ? 'bg-background shadow-sm' : ''}`}
                        onPress={() => setActiveTab('my_apps')}
                    >
                        <Text className={`font-medium ${activeTab === 'my_apps' ? 'text-foreground' : 'text-muted-foreground'}`}>My Apps</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={activeTab === 'testing' ? testingApps : myApps}
                renderItem={activeTab === 'testing' ? renderTestingItem : renderMyAppItem}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16 }}
                ListEmptyComponent={
                    <View className="items-center justify-center py-10">
                        <Text className="text-muted-foreground">Nothing here yet.</Text>
                    </View>
                }
            />

            {/* Quick Add App FAB */}
            <View className="absolute bottom-6 right-6">
                <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onPress={() => router.push('/add-app')}>
                    <Icon as={PlusIcon} className="text-primary-foreground size-8" />
                </Button>
            </View>
        </View>
    );
}
