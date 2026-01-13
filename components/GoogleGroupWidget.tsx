import React from 'react';
import { View, Linking, AppState } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, AlertTriangleIcon } from 'lucide-react-native';

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
    const user = useQuery(api.users.getCurrentUser);
    const confirmMembership = useMutation(api.users.confirmGroupMembership);

    const [hasClickedLink, setHasClickedLink] = React.useState(false);
    const appState = React.useRef(AppState.currentState);

    const [showJoinConfirm, setShowJoinConfirm] = React.useState(false);

    const handleJoinGroup = () => {
        setHasClickedLink(true);
        Linking.openURL("https://groups.google.com/g/developers-community-official");
    };

    const handleConfirm = async () => {
        try {
            await confirmMembership();
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
                // Check if user is already a member before showing dialog
                if (user?.isGroupMember) {
                    setHasClickedLink(false); // Reset click state
                    // Optionally show a welcome back toast if needed, but silence is often better if verified
                    // toast.success("Verified", { description: "You are already a member." });
                } else {
                    setShowJoinConfirm(true);
                }
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, [hasClickedLink, user?.isGroupMember]);

    // If loading, don't show
    if (user === undefined) return null;
    // If not authenticated or error
    if (user === null) return null;

    const renderContent = () => {
        if (user.isGroupMember) {
            return (
                <Card className={cn("border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900/50 overflow-hidden", className)}>
                    <CardContent className="p-4 flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3 flex-1">
                            <View className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
                                <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-5" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-green-800 dark:text-green-200 font-bold text-sm">
                                    Verified Member
                                </Text>
                                <Text className="text-green-700/70 dark:text-green-400/70 text-xs">
                                    Google Group Community
                                </Text>
                            </View>
                        </View>
                        <Button
                            variant="ghost"
                            size="sm"
                            onPress={handleJoinGroup}
                            className="h-8"
                        >
                            <Text className="text-green-700 dark:text-green-300 text-xs font-semibold">Visit Group</Text>
                        </Button>
                    </CardContent>
                </Card>
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
