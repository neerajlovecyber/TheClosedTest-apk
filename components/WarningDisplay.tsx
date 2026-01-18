import React, { useEffect, useState } from 'react';
import { View, Modal } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { AlertTriangleIcon } from 'lucide-react-native';

export function WarningDisplay() {
    const warnings = useQuery(api.moderation.getMyActiveWarnings);
    const markRead = useMutation(api.moderation.markWarningRead);
    const [currentWarning, setCurrentWarning] = useState<any>(null);

    // Update current warning when warnings change
    useEffect(() => {
        if (warnings && warnings.length > 0) {
            setCurrentWarning(warnings[0]);
        } else {
            setCurrentWarning(null);
        }
    }, [warnings]);

    const handleAcknowledge = async () => {
        if (!currentWarning) return;
        try {
            await markRead({ warningId: currentWarning._id });
            // The Query will auto-update, removing this warning from the list
            // effectively showing the next one or closing the modal
        } catch (error) {
            console.error("Failed to acknowledge warning:", error);
        }
    };

    if (!currentWarning) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={!!currentWarning}
            statusBarTranslucent
        >
            <View className="flex-1 bg-black/80 items-center justify-center p-4">
                <Card className="w-full max-w-sm border-orange-500 bg-background shadow-2xl">
                    <CardHeader className="items-center pb-2">
                        <View className="h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center mb-4">
                            <Icon as={AlertTriangleIcon} className="size-8 text-orange-600 dark:text-orange-500" />
                        </View>
                        <CardTitle className="text-xl text-center text-orange-600 dark:text-orange-500">Official Warning</CardTitle>
                    </CardHeader>
                    <CardContent className="gap-4">
                        <Text className="text-center text-muted-foreground">
                            Your account has been flagged for a violation of our community guidelines.
                        </Text>

                        <View className="bg-muted/50 p-4 rounded-lg">
                            <Text className="text-xs font-bold text-muted-foreground uppercase mb-1">Reason</Text>
                            <Text className="font-medium text-foreground">{currentWarning.reason}</Text>
                        </View>

                        <View className="flex-row items-center justify-center gap-2">
                            <Text className="text-sm font-bold text-destructive">-10 Reputation Points</Text>
                        </View>

                        <Text className="text-xs text-center text-muted-foreground mt-2">
                            Repetitive violations may result in a permanent ban.
                        </Text>

                        <Button
                            onPress={handleAcknowledge}
                            className="w-full mt-4 bg-orange-600 hover:bg-orange-700"
                            size="lg"
                        >
                            <Text className="text-white font-bold">I Understand</Text>
                        </Button>
                    </CardContent>
                </Card>
            </View>
        </Modal>
    );
}
