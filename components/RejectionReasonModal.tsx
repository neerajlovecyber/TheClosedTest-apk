import React, { useState } from 'react';
import { View, TouchableOpacity, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { XIcon, AlertTriangleIcon, SendIcon } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

import { deleteImageFromR2 } from '@/utils/image-uploader';

interface RejectionReasonModalProps {
    visible: boolean;
    proofId: Id<"proofs"> | null;
    storageIds?: string[]; // Added to allow deletion
    onClose: () => void;
    onRejected?: () => void;
}

const QUICK_REASONS = [
    "Screenshot is not clear",
    "Wrong app shown",
    "Not enough proof of usage",
    "Looks like a fake screenshot",
    "App not opened properly"
];

export function RejectionReasonModal({ visible, proofId, storageIds, onClose, onRejected }: RejectionReasonModalProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const reviewProofMutation = useMutation(api.matches.reviewProof);

    const handleSubmit = async () => {
        if (reason.trim().length < 10) {
            alert("Please provide a reason with at least 10 characters");
            return;
        }

        if (!proofId) return;

        setIsSubmitting(true);
        try {
            // 1. Delete images from R2 first (if any)
            if (storageIds && storageIds.length > 0) {
                await Promise.all(storageIds.map(async (url) => {
                    // Only delete if it's an R2 URL
                    if (url && url.startsWith('http')) {
                        await deleteImageFromR2(url);
                    }
                }));
            }

            // 2. Update status in DB
            await reviewProofMutation({
                proofId,
                status: "rejected",
                rejectionReason: reason.trim()
            });
            setReason('');
            onClose();
            onRejected?.();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickReason = (quickReason: string) => {
        setReason(quickReason);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
            >
                <Pressable
                    className="flex-1 bg-black/50 justify-end"
                    onPress={onClose}
                >
                    <Pressable
                        className="bg-background rounded-t-3xl"
                        onPress={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <View className="flex-row items-center justify-between p-4 border-b border-border">
                            <View className="flex-row items-center">
                                <Icon as={AlertTriangleIcon} className="text-red-500 size-6 mr-2" />
                                <Text className="text-lg font-bold">Reject Proof</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} className="p-2">
                                <Icon as={XIcon} className="text-muted-foreground size-5" />
                            </TouchableOpacity>
                        </View>

                        {/* Content */}
                        <View className="p-4">
                            <Text className="text-muted-foreground mb-4">
                                Please provide a reason for rejection. This helps your partner understand what went wrong.
                            </Text>

                            {/* Quick Suggestions */}
                            <Text className="text-sm font-medium mb-2 text-muted-foreground">Quick reasons:</Text>
                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {QUICK_REASONS.map((quickReason, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        onPress={() => handleQuickReason(quickReason)}
                                        className={`px-3 py-2 rounded-full ${reason === quickReason
                                            ? 'bg-red-500'
                                            : 'bg-secondary'
                                            }`}
                                    >
                                        <Text className={`text-xs ${reason === quickReason
                                            ? 'text-white font-bold'
                                            : 'text-foreground'
                                            }`}>
                                            {quickReason}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Custom Reason Input */}
                            <Text className="text-sm font-medium mb-2 text-muted-foreground">Or write your own:</Text>
                            <TextInput
                                className="bg-secondary p-4 rounded-xl text-foreground mb-4"
                                placeholder="Explain why you're rejecting this proof..."
                                placeholderTextColor="#9ca3af"
                                value={reason}
                                onChangeText={setReason}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />

                            {/* Character count */}
                            <Text className={`text-xs mb-4 ${reason.length < 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                {reason.length}/10 minimum characters
                            </Text>

                            {/* Submit Button */}
                            <TouchableOpacity
                                onPress={handleSubmit}
                                disabled={isSubmitting || reason.trim().length < 10}
                                className={`bg-red-500 p-4 rounded-xl flex-row items-center justify-center ${(isSubmitting || reason.trim().length < 10) ? 'opacity-50' : ''
                                    }`}
                            >
                                <Icon as={SendIcon} className="text-white size-5 mr-2" />
                                <Text className="text-white font-bold text-lg">
                                    {isSubmitting ? 'Submitting...' : 'Submit Rejection'}
                                </Text>
                            </TouchableOpacity>

                            {/* Warning */}
                            <Text className="text-xs text-muted-foreground text-center mt-3">
                                This action cannot be undone. Your partner will be notified.
                            </Text>
                        </View>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}
