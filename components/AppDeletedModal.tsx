import { Modal, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/clerk-expo';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function AppDeletedModal() {
    const { isSignedIn } = useAuth();
    const user = useQuery(api.users.getCurrentUser);
    const clearPopup = useMutation(api.users.clearDeletionPopup);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (user && user.showDeletionPopup) {
            setVisible(true);
        }
    }, [user]);

    const handleDismiss = async () => {
        await clearPopup();
        setVisible(false);
    };

    if (!isSignedIn || !user) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={() => { }} // Prevent back button closing
        >
            <View className="flex-1 justify-center items-center bg-black/50 p-5">
                <View className="w-full max-w-sm rounded-xl bg-background p-6 border border-border shadow-lg items-center">
                    <Text className="text-xl font-bold mb-4 text-center text-foreground">App Deleted</Text>
                    <Text className="text-base text-muted-foreground text-center mb-2">
                        You missed reviewing your testers' proofs for 2 consecutive days.
                    </Text>
                    <Text className="text-base text-muted-foreground text-center mb-2">
                        To maintain quality, your app has been archived and your active matches have been cancelled.
                    </Text>
                    <Text className="text-base text-muted-foreground text-center mb-6">
                        You can create a new app if you wish to start again.
                    </Text>

                    <Button className="w-full" onPress={handleDismiss}>
                        <Text>I Understand</Text>
                    </Button>
                </View>
            </View>
        </Modal>
    );
}
