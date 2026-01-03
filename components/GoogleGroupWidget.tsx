import React from 'react';
import { View, Linking, Alert, AppState } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ExternalLinkIcon, CheckCircleIcon, AlertTriangleIcon } from 'lucide-react-native';

import { cn } from '@/lib/utils';

export function GoogleGroupWidget({ className }: { className?: string }) {
    const user = useQuery(api.users.getCurrentUser);
    const confirmMembership = useMutation(api.users.confirmGroupMembership);

    // If loading, don't show
    if (user === undefined) return null;
    // If not authenticated or error
    if (user === null) return null;

    const [hasClickedLink, setHasClickedLink] = React.useState(false);
    const appState = React.useRef(AppState.currentState);

    React.useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active' &&
                hasClickedLink
            ) {
                Alert.alert(
                    "Did you join?",
                    "Have you successfully joined the Google Group?",
                    [
                        {
                            text: "No",
                            onPress: () => setHasClickedLink(false),
                            style: "cancel"
                        },
                        {
                            text: "Yes, I've Joined",
                            onPress: () => {
                                setHasClickedLink(false);
                                handleConfirm();
                            }
                        }
                    ]
                );
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, [hasClickedLink]);

    const handleJoinGroup = () => {
        setHasClickedLink(true);
        Linking.openURL("https://groups.google.com/g/theclosedtest");
    };

    const handleConfirm = async () => {
        try {
            await confirmMembership();
            Alert.alert("Success", "Thanks for joining the group!");
        } catch (err) {
            Alert.alert("Error", "Failed to update profile.");
        }
    };

    // Compact State for Members
    if (user.isGroupMember) {
        return (
            <View className={cn("rounded-xl border shadow-sm shadow-black/5 mb-4 bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700", className)}>
                <View className="p-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2 flex-1">
                        <Icon as={CheckCircleIcon} className="text-green-600 dark:text-green-400 size-4 shrink-0" />
                        <Text className="text-green-800 dark:text-green-200 font-medium text-sm flex-1">
                            Verified Google Group Member
                        </Text>
                    </View>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 ml-2"
                        onPress={handleJoinGroup}
                    >
                        <Text className="text-green-700 dark:text-green-300 text-xs">View</Text>
                    </Button>
                </View>
            </View>
        );
    }

    // Compact State for Non-Members
    return (
        <View className={cn("rounded-xl border shadow-sm shadow-black/5 mb-4 bg-amber-50 dark:bg-amber-900 border-amber-200 dark:border-amber-700", className)}>
            <View className="p-3 flex-row items-center justify-between gap-2">
                <View className="flex-row items-center gap-2 flex-1">
                    <Icon as={AlertTriangleIcon} className="text-amber-600 dark:text-amber-500 size-5 shrink-0" />
                    <View className="flex-1">
                        <Text className="font-bold text-amber-800 dark:text-amber-200 text-sm">
                            Join Google Group
                        </Text>
                        <Text className="text-amber-700 dark:text-amber-300 text-xs leading-tight" numberOfLines={1}>
                            Required to test apps
                        </Text>
                    </View>
                </View>

                <View className="flex-row items-center gap-1.5 ml-auto">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-4 border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-800"
                        onPress={handleJoinGroup}
                    >
                        <Text className="text-amber-800 dark:text-amber-200 text-sm font-semibold">Join</Text>
                    </Button>
                </View>
            </View>
        </View>
    );
}
