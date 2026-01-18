import React, { useState } from 'react';
import { View, TouchableOpacity, TextInput, Modal, ScrollView, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { AlertCircleIcon, XIcon } from 'lucide-react-native';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from '@/lib/sonner';
import { Id } from '@/convex/_generated/dataModel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ReportDialogProps {
    visible: boolean;
    onClose: () => void;
    reportType: 'user' | 'app' | 'match';
    targetId: string;
    matchId?: Id<"matches">;
    reportedUserId?: Id<"users">;
    reportedAppId?: Id<"apps">;
    targetName: string;
}

export function ReportDialog({
    visible,
    onClose,
    reportType,
    targetId,
    matchId,
    reportedUserId,
    reportedAppId,
    targetName,
}: ReportDialogProps) {
    const [selectedType, setSelectedType] = useState<"dispute" | "app_spam" | "toxic_user" | "other" | "app_broken" | "user_unresponsive">("other");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const insets = useSafeAreaInsets();

    const createReport = useMutation(api.reports.createReport);

    const reportTypes = [
        { value: "app_spam" as const, label: "Spam or Fake App", description: "App is fake, misleading, or spam" },
        { value: "app_broken" as const, label: "App Not Working", description: "App crashes or cannot be installed" }, // New
        { value: "toxic_user" as const, label: "Toxic Behavior", description: "Harassment, inappropriate language" },
        { value: "user_unresponsive" as const, label: "User Unresponsive", description: "User not fulfilling test requirements" }, // New
        { value: "dispute" as const, label: "Dispute / Conflict", description: "Disagreement about testing or proofs" },
        { value: "other" as const, label: "Other Issue", description: "Something else" },
    ];

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error("Please provide a description");
            return;
        }

        setSubmitting(true);
        try {
            await createReport({
                type: selectedType,
                targetId,
                matchId,
                reportedUserId,
                reportedAppId,
                description: description.trim(),
            });
            toast.success("Report submitted successfully");
            setDescription("");
            onClose();
        } catch (error: any) {
            toast.error("Failed to submit report", { description: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                className="flex-1"
                behavior="padding"
            >
                <View className="flex-1 bg-black/50 justify-end">
                    <View className="bg-background rounded-t-3xl max-h-[85%]">
                        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
                            <View className="flex-1 mr-2">
                                <Text className="text-lg font-bold text-foreground">Report {reportType === 'user' ? 'User' : reportType === 'app' ? 'App' : 'Issue'}</Text>
                                <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>{targetName}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} className="p-1.5">
                                <Icon as={XIcon} className="text-muted-foreground size-5" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            className="p-6"
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                        >
                            <Text className="text-sm font-semibold text-foreground mb-3">Report Reason</Text>
                            <View className="gap-0 mb-4 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                {reportTypes.map((type, index) => (
                                    <TouchableOpacity
                                        key={type.value}
                                        onPress={() => setSelectedType(type.value)}
                                        className={`flex-row items-center justify-between p-4 ${index !== reportTypes.length - 1 ? 'border-b border-border' : ''} ${selectedType === type.value ? 'bg-primary/5' : ''}`}
                                    >
                                        <View className="flex-1">
                                            <Text className="font-semibold text-foreground text-sm">{type.label}</Text>
                                            <Text className="text-xs text-muted-foreground">{type.description}</Text>
                                        </View>
                                        <View className={`h-5 w-5 rounded-full border items-center justify-center ${selectedType === type.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                                            {selectedType === type.value && <View className="h-2 w-2 rounded-full bg-primary-foreground" />}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text className="text-sm font-semibold text-foreground mb-3">Description *</Text>
                            <TextInput
                                className="bg-card border-2 border-border rounded-xl p-4 text-foreground min-h-[120px]"
                                placeholder="Please describe the issue..."
                                placeholderTextColor="#999"
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                textAlignVertical="top"
                                style={{ fontSize: 16 }}
                            />

                            <TouchableOpacity
                                onPress={handleSubmit}
                                disabled={submitting || !description.trim()}
                                className={`mt-6 mb-4 p-4 rounded-xl ${submitting || !description.trim()
                                    ? 'bg-muted'
                                    : 'bg-primary'
                                    }`}
                            >
                                <Text className={`text-center font-bold ${submitting || !description.trim()
                                    ? 'text-muted-foreground'
                                    : 'text-primary-foreground'
                                    }`}>
                                    {submitting ? 'Submitting...' : 'Submit Report'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
