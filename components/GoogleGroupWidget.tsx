import React from 'react';
import { View, Linking, AppState } from 'react-native';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, AlertTriangleIcon } from 'lucide-react-native';
import { useCurrentUser, useConfirmGroup } from '@/lib/api-hooks';

import { toast } from '@/lib/sonner';
import { cn } from '@/lib/utils';
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

export function GoogleGroupWidget({ className }: { className?: string }) {
    const { data: user, isLoading } = useCurrentUser();
    const confirmMembership = useConfirmGroup();

    const [hasClickedLink, setHasClickedLink] = React.useState(false);
    const [showJoinConfirm, setShowJoinConfirm] = React.useState(false);
    const appState = React.useRef(AppState.currentState);

    const isGroupMember = Boolean(user?.isGroupMember || user?.googleGroupConfirmed);

    const handleJoinGroup = () => {
        setHasClickedLink(true);
        Linking.openURL("https://groups.google.com/g/developers-community-official");
    };

    const handleConfirm = async () => {
        try {
            await confirmMembership.mutateAsync();
            toast.success("Success", { description: "Thanks for joining the group!" });
        } catch (err) {
            toast.error("Error", { description: "Failed to update profile." });
        } finally {
            setShowJoinConfirm(false);
            setHasClickedLink(false);
        }
    };

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active' &&
                hasClickedLink
            ) {
                if (isGroupMember) {
                    setHasClickedLink(false);
                } else {
                    setShowJoinConfirm(true);
                }
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, [hasClickedLink, isGroupMember]);

    if (isLoading || !user) return null;

    const renderContent = () => {
        if (isGroupMember) {
            return (
                <View className={cn("flex-row items-center gap-3 bg-green-500/10 border border-green-500/30 p-3 rounded-xl", className)}>
                    <View className="bg-green-500/20 p-2 rounded-lg items-center justify-center">
                        <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-5" />
                    </View>
                    <View className="flex-1">
                        <Text className="text-green-700 dark:text-green-400 font-bold text-sm">Google Group Joined</Text>
                        <Text className="text-green-600/80 dark:text-green-400/80 text-xs">Verified community member</Text>
                    </View>
                </View>
            );
        }

        return (
            <Card className={cn("border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/50 overflow-hidden", className)}>
                <CardHeader className="pb-2 bg-amber-100/50 dark:bg-amber-900/20 border-b border-amber-200/50 dark:border-amber-900/30">
                    <View className="flex-row items-center gap-2">
                        <Icon as={AlertTriangleIcon} className="text-amber-600 dark:text-amber-500 size-5" />
                        <CardTitle className="text-amber-800 dark:text-amber-200 text-base">Join Google Group</CardTitle>
                    </View>
                </CardHeader>
                <CardContent className="p-4">
                    <Text className="text-amber-700 dark:text-amber-300 text-sm mb-4 leading-relaxed">
                        You must be a member of our Google Group to test other apps and get testers for your own app.
                    </Text>
                    <Button
                        size="sm"
                        className="bg-amber-600 dark:bg-amber-700 shadow-sm shadow-amber-900/20"
                        onPress={handleJoinGroup}
                    >
                        <Text className="text-white font-bold">Join Community Now</Text>
                    </Button>
                </CardContent>
            </Card>
        );
    };

    return (
        <>
            {renderContent()}

            <AlertDialog open={showJoinConfirm} onOpenChange={setShowJoinConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Did you join?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Have you successfully joined the Google Group?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onPress={() => {
                            setShowJoinConfirm(false);
                            setHasClickedLink(false);
                        }}>
                            <Text>No</Text>
                        </AlertDialogCancel>
                        <AlertDialogAction onPress={handleConfirm}>
                            <Text>Yes, I've Joined</Text>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
