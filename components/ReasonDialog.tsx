import React, { useState } from 'react';
import { View, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface ReasonDialogProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    title: string;
    placeholder?: string;
    confirmText?: string;
    initialValue?: string;
}

export function ReasonDialog({
    visible,
    onClose,
    onConfirm,
    title,
    placeholder = "Reason...",
    confirmText = "Confirm",
    initialValue = "",
}: ReasonDialogProps) {
    const [reason, setReason] = useState(initialValue);

    const handleConfirm = () => {
        onConfirm(reason);
        setReason("");
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <View className="flex-1 bg-black/80 items-center justify-center p-4">
                    <Card className="w-full max-w-sm bg-background">
                        <CardHeader className="pb-2">
                            <CardTitle>{title}</CardTitle>
                        </CardHeader>
                        <CardContent className="gap-4">
                            <TextInput
                                className="bg-muted p-3 rounded-md text-foreground min-h-[100px] text-base"
                                placeholder={placeholder}
                                placeholderTextColor="#999"
                                value={reason}
                                onChangeText={setReason}
                                multiline
                                textAlignVertical="top"
                                autoFocus
                            />
                            <View className="flex-row justify-end gap-3 mt-2">
                                <TouchableOpacity onPress={onClose} className="p-3">
                                    <Text className="font-semibold text-muted-foreground">Cancel</Text>
                                </TouchableOpacity>
                                <Button
                                    onPress={handleConfirm}
                                    disabled={!reason.trim()}
                                    className="bg-primary"
                                >
                                    <Text className="text-primary-foreground font-bold">{confirmText}</Text>
                                </Button>
                            </View>
                        </CardContent>
                    </Card>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
