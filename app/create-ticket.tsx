import React, { useState } from 'react';
import { View, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'expo-router';
import { toast } from '@/lib/sonner';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon } from 'lucide-react-native';

export default function CreateTicketScreen() {
    const router = useRouter();
    const createTicket = useMutation(api.tickets.createTicket);

    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) {
            toast.error("Please fill in all fields");
            return;
        }

        setSubmitting(true);
        try {
            await createTicket({
                subject: subject.trim(),
                initialMessage: message.trim(),
                priority,
            });
            toast.success("Ticket created successfully");
            router.back();
        } catch (error: any) {
            toast.error("Failed to create ticket", { description: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center px-4 py-3 border-b border-border">
                <TouchableOpacity onPress={() => router.back()} className="mr-3">
                    <Icon as={ArrowLeftIcon} className="size-6 text-foreground" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-foreground">New Support Ticket</Text>
            </View>

            <ScrollView className="flex-1 p-6">
                <View className="mb-6">
                    <Text className="text-sm font-semibold text-foreground mb-2">Subject</Text>
                    <TextInput
                        className="bg-card border border-border rounded-xl p-4 text-foreground text-base"
                        placeholder="Brief summary of issue..."
                        placeholderTextColor="#999"
                        value={subject}
                        onChangeText={setSubject}
                    />
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-semibold text-foreground mb-2">Priority</Text>
                    <View className="flex-row gap-3">
                        {(['low', 'medium', 'high'] as const).map((p) => (
                            <TouchableOpacity
                                key={p}
                                onPress={() => setPriority(p)}
                                className={`flex-1 py-3 items-center rounded-xl border ${priority === p
                                        ? 'bg-primary border-primary'
                                        : 'bg-card border-border'
                                    }`}
                            >
                                <Text className={`font-semibold capitalize ${priority === p ? 'text-primary-foreground' : 'text-foreground'
                                    }`}>
                                    {p}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View className="mb-8">
                    <Text className="text-sm font-semibold text-foreground mb-2">Message</Text>
                    <TextInput
                        className="bg-card border border-border rounded-xl p-4 text-foreground text-base min-h-[150px]"
                        placeholder="Describe your issue in detail..."
                        placeholderTextColor="#999"
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    className={`p-4 rounded-xl ${submitting ? 'bg-muted' : 'bg-primary'}`}
                >
                    <Text className={`text-center font-bold text-lg ${submitting ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                        {submitting ? 'Creating Ticket...' : 'Submit Ticket'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}
