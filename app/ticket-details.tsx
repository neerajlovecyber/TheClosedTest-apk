import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { toast } from '@/lib/sonner';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, SendIcon, UserIcon, ShieldIcon } from 'lucide-react-native';
import { format } from 'date-fns';
import { Id } from '@/convex/_generated/dataModel';

export default function TicketDetailsScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const ticket = useQuery(api.tickets.getTicketDetails, { ticketId: id as Id<"support_tickets"> });
    const addMessage = useMutation(api.tickets.addTicketMessage);

    const [newMessage, setNewMessage] = useState("");
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!newMessage.trim()) return;

        setSending(true);
        try {
            await addMessage({
                ticketId: id as Id<"support_tickets">,
                content: newMessage.trim(),
            });
            setNewMessage("");
        } catch (error: any) {
            toast.error("Failed to send message", { description: error.message });
        } finally {
            setSending(false);
        }
    };

    if (!ticket) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text className="text-muted-foreground">Loading ticket...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />
            <View className="flex-row items-center px-4 py-3 border-b border-border">
                <TouchableOpacity onPress={() => router.back()} className="mr-3">
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <View className="flex-1">
                    <Text className="text-lg font-bold text-foreground" numberOfLines={1}>{ticket.subject}</Text>
                    <Text className="text-xs text-muted-foreground capitalize">{ticket.status.replace('_', ' ')} • {ticket.priority} priority</Text>
                </View>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
            >
                <ScrollView
                    className="flex-1 px-4 py-4"
                    contentContainerStyle={{ paddingBottom: 20 }}
                >
                    {ticket.messages.map((msg: any, index: number) => (
                        <View
                            key={index}
                            className={`mb-4 max-w-[85%] rounded-2xl p-4 ${msg.isAdmin
                                    ? 'bg-muted self-start rounded-tl-none'
                                    : 'bg-primary self-end rounded-tr-none'
                                }`}
                        >
                            <View className="flex-row items-center gap-2 mb-1">
                                <Icon
                                    as={msg.isAdmin ? ShieldIcon : UserIcon}
                                    className={`size-3 ${msg.isAdmin ? 'text-primary' : 'text-primary-foreground/70'}`}
                                />
                                <Text className={`text-xs font-bold ${msg.isAdmin ? 'text-primary' : 'text-primary-foreground/70'}`}>
                                    {msg.isAdmin ? 'Support Team' : 'You'}
                                </Text>
                            </View>
                            <Text className={`text-base ${msg.isAdmin ? 'text-foreground' : 'text-primary-foreground'}`}>
                                {msg.content}
                            </Text>
                            <Text className={`text-[10px] mt-1 text-right ${msg.isAdmin ? 'text-muted-foreground' : 'text-primary-foreground/60'}`}>
                                {format(msg.timestamp, 'h:mm a')}
                            </Text>
                        </View>
                    ))}
                </ScrollView>

                {ticket.status !== 'closed' && (
                    <View className="p-4 border-t border-border bg-background">
                        <View className="flex-row items-center gap-3">
                            <TextInput
                                className="flex-1 bg-muted p-3 rounded-full text-foreground max-h-24"
                                placeholder="Type a message..."
                                placeholderTextColor="#999"
                                value={newMessage}
                                onChangeText={setNewMessage}
                                multiline
                            />
                            <TouchableOpacity
                                onPress={handleSend}
                                disabled={sending || !newMessage.trim()}
                                className={`p-3 rounded-full ${sending || !newMessage.trim() ? 'bg-muted' : 'bg-primary'}`}
                            >
                                <Icon as={SendIcon} className={`size-5 ${sending || !newMessage.trim() ? 'text-muted-foreground' : 'text-primary-foreground'}`} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
