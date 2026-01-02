import React, { useState } from 'react';
import { View, SectionList, TouchableOpacity, Image } from 'react-native';
import { AppCard } from '@/components/AppCard';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, ClockIcon, FlaskConicalIcon, PlusIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function TestsScreen() {
    const router = useRouter();
    // Dummy Data
    // Dummy Data
    const testingApps = [
        { id: '1', name: "Super Calc", status: "pending", day: 5, totalDays: 14, owner: "Mike", relatedMyApp: "My Awesome Game" },
        { id: '2', name: "Fitness Pro", status: "completed", day: 12, totalDays: 14, owner: "Sarah", relatedMyApp: "My Utility App" },
        { id: '3', name: "Bird Watcher", status: "pending", day: 1, totalDays: 14, owner: "Tom", relatedMyApp: "My Awesome Game" },
    ];

    const groupedData: Array<{ title: string; data: typeof testingApps }> = Object.values(testingApps.reduce((acc: any, item) => {
        if (!acc[item.relatedMyApp]) {
            acc[item.relatedMyApp] = { title: item.relatedMyApp, data: [] };
        }
        acc[item.relatedMyApp].data.push(item);
        return acc;
    }, {}));

    const renderTestingItem = ({ item }: { item: any }) => (
        <AppCard
            item={{
                _id: String(item.id),
                title: item.name,
                ownerName: item.owner,
                dueIn: item.status !== 'completed' ? 'Due Today' : undefined,
                day: item.day,
                totalDays: item.totalDays,
                status: item.status
            }}
            variant="testing"
            onPress={undefined}
        />
    );



    return (
        <View className="flex-1 bg-background">
            {/* Header */}
            <View className="px-6 py-4 border-b border-border">
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">My Tasks</Text>
                <Text className="text-sm text-muted-foreground font-medium mt-0.5">Apps you are currently testing.</Text>
            </View>

            <SectionList
                sections={groupedData}
                keyExtractor={(item) => item.id}
                renderItem={renderTestingItem}
                renderSectionHeader={({ section: { title } }) => (
                    <View className="mb-2 mt-4">
                        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            For: <Text className="text-primary">{title}</Text>
                        </Text>
                    </View>
                )}
                contentContainerStyle={{ padding: 16 }}
                stickySectionHeadersEnabled={false}
                ListEmptyComponent={
                    <View className="items-center justify-center py-10">
                        <Text className="text-muted-foreground">No active tests found.</Text>
                    </View>
                }
            />
        </View>
    );
}
