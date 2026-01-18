import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '@/lib/sonner';
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
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { ArrowLeftIcon, BellIcon, SendIcon, UsersIcon, SparklesIcon } from 'lucide-react-native';
import { Button } from '@/components/ui/button';

const DEFAULT_TEMPLATES = [
    {
        id: 'update',
        title: '✨ New Features Available!',
        body: 'We\'ve added exciting new features to improve your testing experience.',
        icon: '✨',
    },
];

export default function NotificationsAdminScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [showBroadcastConfirm, setShowBroadcastConfirm] = useState(false);

    const stats = useQuery(api.admin.getNotificationStats);
    const sendTestNotification = useAction(api.admin.sendTestNotification);
    const sendBroadcastNotification = useAction(api.admin.sendBroadcastNotification);

    const handleSendTest = async () => {
        if (!title.trim() || !body.trim()) {
            toast.error('Error', { description: 'Please enter both title and message' });
            return;
        }

        setSending(true);
        try {
            const result = await sendTestNotification({ title, body });
            console.log("Test notification result:", result);

            // Show detailed result
            const resultText = result?.result?.data?.status === 'ok'
                ? 'Notification sent successfully!\n\nNote: If you\'re on Expo Go (Android), you won\'t receive it. Build a development build to test.'
                : `Sent! Status: ${result?.result?.data?.status || 'unknown'}`;

            toast.success('Success', { description: resultText });
            // Don't clear fields for test - easier to tweak and resend
        } catch (error: any) {
            console.error("Test notification error:", error);
            toast.error('Error', { description: error.message || 'Failed to send notification' });
        } finally {
            setSending(false);
        }
    };

    const handleSendBroadcast = async () => {
        if (!title.trim() || !body.trim()) {
            toast.error('Error', { description: 'Please enter both title and message' });
            return;
        }
        setShowBroadcastConfirm(true);
    };

    const confirmBroadcast = async () => {
        setSending(true);
        setShowBroadcastConfirm(false);
        try {
            const result = await sendBroadcastNotification({ title, body });
            toast.success('Success', {
                description: `Notification sent to ${result.successCount} users!\nFailed: ${result.failureCount}`
            });
            setTitle('');
            setBody('');
        } catch (error: any) {
            toast.error('Error', { description: error.message || 'Failed to send broadcast' });
        } finally {
            setSending(false);
        }
    };

    return (
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
                keyboardVerticalOffset={0}
            >
                <View className="px-6 py-4 flex-row items-center border-b border-border/50">
                    <TouchableOpacity onPress={() => router.back()} className="mr-4">
                        <Icon as={ArrowLeftIcon} className="text-foreground size-6" />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-xl font-bold text-foreground">Push Notifications</Text>
                        <Text className="text-xs text-muted-foreground">Send and test notifications</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-6 py-4">
                    {/* Stats Cards */}
                    <View className="flex-row gap-3 mb-6">
                        <View className="flex-1 bg-primary/10 p-4 rounded-xl">
                            <Icon as={UsersIcon} className="text-primary size-6 mb-2" />
                            <Text className="text-2xl font-bold text-foreground">
                                {stats?.totalUsersWithTokens || 0}
                            </Text>
                            <Text className="text-xs text-muted-foreground">Users with tokens</Text>
                        </View>
                        <View className="flex-1 bg-green-500/10 p-4 rounded-xl">
                            <Icon as={BellIcon} className="text-green-600 size-6 mb-2" />
                            <Text className="text-2xl font-bold text-foreground">
                                {stats?.totalUsers || 0}
                            </Text>
                            <Text className="text-xs text-muted-foreground">Total users</Text>
                        </View>
                    </View>

                    {/* Templates Section */}
                    <View className="mb-4">
                        <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                            Quick Templates
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                            {DEFAULT_TEMPLATES.map((template) => (
                                <TouchableOpacity
                                    key={template.id}
                                    onPress={() => {
                                        setTitle(template.title);
                                        setBody(template.body);
                                    }}
                                    className="bg-card border border-border rounded-xl p-3 mr-2 w-[180px]"
                                >
                                    <Text className="text-2xl mb-1">{template.icon}</Text>
                                    <Text className="font-semibold text-foreground text-xs mb-1" numberOfLines={2}>
                                        {template.title}
                                    </Text>
                                    <Text className="text-[10px] text-muted-foreground" numberOfLines={3}>
                                        {template.body}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Notification Form */}
                    <View className="bg-card p-4 rounded-xl border border-border mb-4">
                        <Text className="text-lg font-bold mb-4">Create Notification</Text>

                        <Text className="text-sm font-medium mb-2 text-foreground">Title</Text>
                        <TextInput
                            className="bg-background border border-border rounded-lg px-4 py-3 mb-4 text-foreground"
                            placeholder="Enter notification title"
                            placeholderTextColor="#888"
                            value={title}
                            onChangeText={setTitle}
                            maxLength={50}
                        />

                        <Text className="text-sm font-medium mb-2 text-foreground">Message</Text>
                        <TextInput
                            className="bg-background border border-border rounded-lg px-4 py-3 mb-4 text-foreground"
                            placeholder="Enter notification message"
                            placeholderTextColor="#888"
                            value={body}
                            onChangeText={setBody}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            maxLength={200}
                        />

                        <View className="flex-row gap-3">
                            <Button
                                onPress={handleSendTest}
                                disabled={sending || !title.trim() || !body.trim()}
                                className="flex-1"
                                variant="outline"
                            >
                                <Icon as={SendIcon} className="text-foreground size-4 mr-2" />
                                <Text>Test</Text>
                            </Button>

                            <Button
                                onPress={handleSendBroadcast}
                                disabled={sending || !title.trim() || !body.trim()}
                                className="flex-1"
                            >
                                <Icon as={BellIcon} className="text-primary-foreground size-4 mr-2" />
                                <Text>Broadcast</Text>
                            </Button>
                        </View>

                        {/* Preview - Inside the card */}
                        {(title || body) && (
                            <View className="mt-4 pt-4 border-t border-border">
                                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Preview</Text>
                                <View className="bg-muted/30 p-3 rounded-lg border border-border">
                                    {title && <Text className="font-bold text-foreground mb-1">{title}</Text>}
                                    {body && <Text className="text-sm text-muted-foreground">{body}</Text>}
                                </View>
                            </View>
                        )}
                    </View>


                </ScrollView>

                <AlertDialog open={showBroadcastConfirm} onOpenChange={setShowBroadcastConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Broadcast</AlertDialogTitle>
                            <AlertDialogDescription>
                                Send notification to {stats?.totalUsersWithTokens || 0} users?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onPress={() => setShowBroadcastConfirm(false)}>
                                <Text>Cancel</Text>
                            </AlertDialogCancel>
                            <AlertDialogAction onPress={confirmBroadcast}>
                                <Text>Send</Text>
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </KeyboardAvoidingView>
        </View >
    );
}
