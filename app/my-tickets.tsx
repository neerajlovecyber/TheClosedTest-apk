import React from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { PlusIcon, MessageSquareIcon, ChevronRightIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';

export default function MyTicketsScreen() {
    const router = useRouter();
    const tickets = useQuery(api.tickets.getUserTickets);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'in_progress': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
            case 'resolved': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            case 'closed': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right', 'bottom']}>
            <View className="flex-1 px-4 pt-4">
                <View className="flex-row items-center justify-between mb-6">
                    <View>
                        <Text className="text-3xl font-black text-foreground tracking-tight">Support Tickets</Text>
                        <Text className="text-muted-foreground font-medium mt-1">Track your support requests</Text>
                    </View>
                </View>

                {!tickets ? (
                    <View className="flex-1 items-center justify-center">
                        <Text className="text-muted-foreground">Loading tickets...</Text>
                    </View>
                ) : tickets.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-8">
                        <View className="bg-muted/50 p-6 rounded-full mb-4">
                            <Icon as={MessageSquareIcon} className="size-10 text-muted-foreground" />
                        </View>
                        <Text className="text-lg font-bold text-foreground text-center mb-2">No Tickets Yet</Text>
                        <Text className="text-muted-foreground text-center mb-6">
                            Need help? Create a support ticket and we'll get back to you.
                        </Text>
                        <TouchableOpacity
                            onPress={() => router.push('/create-ticket')}
                            className="bg-primary px-6 py-3 rounded-xl flex-row items-center gap-2"
                        >
                            <Icon as={PlusIcon} className="text-primary-foreground size-5" />
                            <Text className="text-primary-foreground font-bold">Create Ticket</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={tickets}
                        keyExtractor={(item) => item._id}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => router.push(`/ticket-details?id=${item._id}`)}
                                activeOpacity={0.7}
                            >
                                <Card className="mb-4 border-border shadow-sm">
                                    <CardContent className="p-4">
                                        <View className="flex-row justify-between items-start mb-2">
                                            <View className={`px-2 py-1 rounded-md ${getStatusColor(item.status)}`}>
                                                <Text className="text-xs font-bold capitalize">
                                                    {item.status.replace('_', ' ')}
                                                </Text>
                                            </View>
                                            <Text className="text-xs text-muted-foreground">
                                                {format(item.createdAt, 'MMM d, h:mm a')}
                                            </Text>
                                        </View>

                                        <Text className="text-lg font-bold text-foreground mb-1" numberOfLines={1}>
                                            {item.subject}
                                        </Text>

                                        <View className="flex-row items-center justify-between mt-2">
                                            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                                                {item.messages[item.messages.length - 1]?.content || "No messages"}
                                            </Text>
                                            <Icon as={ChevronRightIcon} className="size-4 text-muted-foreground" />
                                        </View>
                                    </CardContent>
                                </Card>
                            </TouchableOpacity>
                        )}
                    />
                )}
            </View>

            {/* FAB for creating ticket */}
            {tickets && tickets.length > 0 && (
                <TouchableOpacity
                    onPress={() => router.push('/create-ticket')}
                    className="absolute bottom-6 right-6 bg-primary h-14 w-14 rounded-full items-center justify-center shadow-lg shadow-primary/30"
                >
                    <Icon as={PlusIcon} className="text-primary-foreground size-7" />
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}
