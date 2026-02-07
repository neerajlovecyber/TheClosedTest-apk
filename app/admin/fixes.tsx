import React, { useState } from 'react';
import { View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Stack } from 'expo-router';
import { toast } from '@/lib/sonner';

export default function AdminFixesScreen() {
    const backfillMatchProofStatus = useMutation(api.matches.backfillMatchProofStatus);
    const fixAllApps = useMutation(api.admin.fixAllApps);
    const triggerAutoPenalize = useMutation(api.maintenance.triggerAutoPenalize);

    const [loadingMatchFix, setLoadingMatchFix] = useState(false);
    const [loadingStatusFix, setLoadingStatusFix] = useState(false);
    const [loadingAutoPenalize, setLoadingAutoPenalize] = useState(false);

    // We don't need a result state anymore if we use toast, but keeping it simple if needed for debug
    const [result, setResult] = useState<string | null>(null);

    const isLoading = loadingMatchFix || loadingStatusFix || loadingAutoPenalize;

    const handleMatchFix = async () => {
        try {
            setLoadingMatchFix(true);
            setResult(null);
            const res = await backfillMatchProofStatus();
            setResult(res);
            Alert.alert("Success", res);
        } catch (e: any) {
            Alert.alert("Error", e.message);
        } finally {
            setLoadingMatchFix(false);
        }
    };

    const handleFixAllStatuses = async () => {
        try {
            setLoadingStatusFix(true);
            const result: any = await fixAllApps();
            if (result.success) {
                toast.success("Batch Fix Complete", {
                    description: `Checked ${result.appsChecked} apps. Fixed ${result.fixedCount} apps.`
                });
            } else {
                toast.error("Batch Fix Failed", { description: "Unknown error" });
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setLoadingStatusFix(false);
        }
    };

    const handleAutoPenalize = async () => {
        Alert.alert(
            "Run Auto-Penalize",
            "This will penalize ALL inactive users (missed 2+ days). Their apps will be deleted and they'll lose 20 reputation.\n\nContinue?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Run",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setLoadingAutoPenalize(true);
                            const result = await triggerAutoPenalize();
                            toast.success("Auto-Penalize Scheduled", {
                                description: result.message
                            });
                        } catch (e: any) {
                            toast.error("Error", { description: e.message });
                        } finally {
                            setLoadingAutoPenalize(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <ScrollView className="flex-1 bg-background p-4">
            <Stack.Screen options={{ title: "Maintenance Fixes" }} />

            <Text className="text-2xl font-bold mb-6 text-foreground">Admin Maintenance</Text>

            <Card className="mb-4">
                <CardHeader>
                    <CardTitle>Batch Fix App Statuses</CardTitle>
                </CardHeader>
                <CardContent>
                    <Text className="mb-4 text-muted-foreground">
                        Recalculates "Filled" vs "Recruiting" status for all apps based on current tester counts.
                    </Text>
                    <Button
                        onPress={handleFixAllStatuses}
                        disabled={isLoading}
                        variant="outline"
                    >
                        {loadingStatusFix ? <ActivityIndicator color="black" /> : <Text>Run Batch Fix</Text>}
                    </Button>
                </CardContent>
            </Card>

            <Card className="mb-4 border-red-200">
                <CardHeader>
                    <CardTitle className="text-red-700">🚨 Auto-Penalize Inactive Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <Text className="mb-4 text-muted-foreground">
                        Runs the cron job manually. Penalizes ALL users who missed 2+ consecutive days:
                        deletes their app, cancels matches, -20 reputation.
                    </Text>
                    <Button
                        onPress={handleAutoPenalize}
                        disabled={isLoading}
                        variant="destructive"
                    >
                        {loadingAutoPenalize ? <ActivityIndicator color="white" /> : <Text>Run Auto-Penalize Now</Text>}
                    </Button>
                </CardContent>
            </Card>

            <Card className="mb-4">
                <CardHeader>
                    <CardTitle>Backfill Match Proofs</CardTitle>
                </CardHeader>
                <CardContent>
                    <Text className="mb-4 text-muted-foreground">
                        Synchronizes `matches` table cache (userLastProof) with `proofs` table data.
                        Use this if test tab shows "not uploaded" but proofs exist.
                    </Text>
                    <Button
                        onPress={handleMatchFix}
                        disabled={isLoading}
                        variant="secondary"
                    >
                        {loadingMatchFix ? <ActivityIndicator color="black" /> : <Text>Run Match Fix</Text>}
                    </Button>
                </CardContent>
            </Card>

            {result && (
                <View className="mt-4 p-4 bg-muted rounded-lg">
                    <Text className="font-mono text-sm">{result}</Text>
                </View>
            )}

            <InactiveAppsScan />
        </ScrollView>
    );
}

function InactiveAppsScan() {
    const [enabled, setEnabled] = useState(false);
    const [penalizingId, setPenalizingId] = useState<string | null>(null);

    // Only fetch when enabled
    const inactiveApps = useQuery(api.maintenance.listInactiveApps, enabled ? {} : "skip");
    const penalizeUser = useMutation(api.maintenance.penalizeInactiveUser);

    const handlePenalize = async (userId: any, appId: any, appName: string) => {
        Alert.alert(
            "Confirm Penalty",
            `This will:\n• Delete "${appName}"\n• Cancel all matches\n• Deduct 20 reputation\n\nProceed?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Penalize",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setPenalizingId(userId);
                            const result = await penalizeUser({ userId, appId });
                            toast.success("Penalty Applied", {
                                description: `App "${result.appDeleted}" deleted. Rep: ${result.reputationBefore} → ${result.reputationAfter}`
                            });
                        } catch (e: any) {
                            toast.error("Error", { description: e.message });
                        } finally {
                            setPenalizingId(null);
                        }
                    }
                }
            ]
        );
    };

    return (
        <Card className="mb-4 mt-4 border-red-200">
            <CardHeader>
                <CardTitle className="text-red-700">Inactive Apps (Missed 2+ Days)</CardTitle>
            </CardHeader>
            <CardContent>
                <Text className="mb-4 text-muted-foreground">
                    Scans for applications where the owner has missed uploading proofs for 2 consecutive days.
                    Use "Penalize" to delete their app and deduct 20 reputation.
                </Text>

                <Button
                    onPress={() => setEnabled(true)}
                    variant="destructive"
                    className="mb-4"
                >
                    <Text>{enabled ? "Refresh Scan" : "Scan for Inactive Apps"}</Text>
                </Button>

                {enabled && !inactiveApps && <ActivityIndicator color="red" />}

                {enabled && inactiveApps && inactiveApps.length === 0 && (
                    <Text className="text-green-600 font-bold">No inactive apps found! Everyone is diligent.</Text>
                )}

                {enabled && inactiveApps && inactiveApps.length > 0 && (
                    <View className="gap-2">
                        {inactiveApps.map((item: any, idx: number) => (
                            <View key={idx} className="bg-red-50 p-3 rounded border border-red-100">
                                <Text className="font-bold text-base">{item.appName || "Unknown App"}</Text>
                                <Text className="text-red-700 font-semibold">Failed to test: {item.targetAppName || "Unknown Target App"}</Text>
                                <Text>Owner: {item.userName} ({item.userEmail})</Text>
                                <Text className="text-xs text-muted-foreground">Days Missed: {item.daysMissed.join(", ")} (Current Day: {item.currentDay})</Text>
                                <Text className="text-xs text-muted-foreground mb-2">Match: {item.matchId}</Text>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onPress={() => handlePenalize(item.userId, item.appId, item.appName)}
                                    disabled={penalizingId === item.userId}
                                >
                                    {penalizingId === item.userId ? <ActivityIndicator color="white" size="small" /> : <Text>Penalize (-20 Rep, Delete App)</Text>}
                                </Button>
                            </View>
                        ))}
                    </View>
                )}
            </CardContent>
        </Card>
    );
}
