import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Platform, Modal, Pressable, useWindowDimensions, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { SendIcon, ChevronDownIcon, FlagIcon } from 'lucide-react-native';

interface MatchChatProps {
    visible: boolean;
    onClose: () => void;
    matchId: Id<"matches">;
    partnerName: string;
    onReport?: () => void;
    currentUserId?: Id<"users">;
}

export function MatchChat({ visible, onClose, matchId, partnerName, onReport, currentUserId }: MatchChatProps) {
    const { height: SCREEN_HEIGHT } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const messages = useQuery(api.matches.getMessages, visible ? { matchId } : "skip") || [];
    const sendMessageMutation = useMutation(api.matches.sendMessage);
    const markAsReadMutation = useMutation(api.matches.markMessagesAsRead);
    const [newMessage, setNewMessage] = useState('');
    const inputRef = useRef<TextInput>(null);

    const chatMessages = useMemo(() => {
        return [...messages].reverse();
    }, [messages]);

    useEffect(() => {
        if (visible) {
            markAsReadMutation({ matchId });
        }
    }, [visible, matchId, markAsReadMutation]);


    const handleSend = async () => {
        if (!newMessage.trim()) return;
        const text = newMessage;
        setNewMessage('');
        try {
            await sendMessageMutation({
                matchId,
                content: text,
                type: "text"
            });
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        // Optimized: Derive isMe locally to avoid dependency on user doc fetch in backend
        const isMe = currentUserId ? item.senderId === currentUserId : item.isMe;
        return (
            <View className={`flex-row ${isMe ? 'justify-end' : 'justify-start'} mb-3 px-4`}>
                <View
                    style={{ maxWidth: '80%' }}
                    className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-primary rounded-tr-none' : 'bg-secondary rounded-tl-none'}`}
                >
                    <Text className={`${isMe ? 'text-primary-foreground font-medium' : 'text-foreground'}`}>
                        {item.content}
                    </Text>
                    <Text className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'}`}>
                        {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <View className="flex-1 justify-end">
                    {/* Backdrop */}
                    <Pressable
                        className="absolute inset-0 bg-black/40"
                        onPress={onClose}
                    />

                    <View
                        style={{ height: SCREEN_HEIGHT * 0.75 }}
                        className="bg-background rounded-t-[32px] overflow-hidden shadow-2xl border-t border-border"
                    >
                        {/* Custom Header Area */}
                        <View className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-background">
                            <View className="flex-row items-center">
                                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
                                    <Text className="text-primary font-bold text-sm">{partnerName.charAt(0)}</Text>
                                </View>
                                <Text className="font-bold text-lg">{partnerName}</Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                {onReport && (
                                    <TouchableOpacity
                                        onPress={onReport}
                                        className="p-2 bg-red-50 dark:bg-red-900/20 rounded-full"
                                    >
                                        <Icon as={FlagIcon} className="text-red-600 dark:text-red-400 size-5" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    onPress={onClose}
                                    className="p-2 bg-secondary/50 rounded-full"
                                >
                                    <Icon as={ChevronDownIcon} className="text-muted-foreground size-5" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Chat Messages */}
                        <FlatList
                            data={chatMessages}
                            renderItem={renderMessage}
                            keyExtractor={item => item._id}
                            inverted
                            className="flex-1"
                            contentContainerStyle={{ paddingVertical: 20 }}
                        />

                        {/* Input Area */}
                        <View
                            className="flex-row items-center px-4 pt-4 border-t border-border bg-background"
                            style={{ paddingBottom: insets.bottom + 16 }}
                        >
                            <TextInput
                                ref={inputRef}
                                className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 text-foreground max-h-32 text-sm"
                                placeholder="Message..."
                                placeholderTextColor="#9ca3af"
                                value={newMessage}
                                onChangeText={setNewMessage}
                                multiline
                                blurOnSubmit={false}
                            />
                            <TouchableOpacity
                                onPress={handleSend}
                                className={`ml-3 w-10 h-10 rounded-full items-center justify-center ${newMessage.trim() ? 'bg-primary' : 'bg-muted/50'}`}
                                disabled={!newMessage.trim()}
                            >
                                <Icon as={SendIcon} className={`${newMessage.trim() ? 'text-primary-foreground' : 'text-muted-foreground'} size-5`} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
