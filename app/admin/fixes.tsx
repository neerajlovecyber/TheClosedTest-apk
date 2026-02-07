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

    const [loadingMatchFix, setLoadingMatchFix] = useState(false);
    const [loadingStatusFix, setLoadingStatusFix] = useState(false);

    // We don't need a result state anymore if we use toast, but keeping it simple if needed for debug
    const [result, setResult] = useState<string | null>(null);

    const isLoading = loadingMatchFix || loadingStatusFix;

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

    // Only fetch when enabled
    const inactiveApps = useQuery(api.maintenance.listInactiveApps, enabled ? {} : "skip");

    return (
        <Card className="mb-4 mt-4 border-red-200">
            <CardHeader>
                <CardTitle className="text-red-700">Inactive Apps (Missed 2+ Days)</CardTitle>
            </CardHeader>
            <CardContent>
                <Text className="mb-4 text-muted-foreground">
                    Scans for applications where the owner has missed uploading proofs for 2 consecutive days.
                    This usually triggers auto-deletion/archiving (currently disabled).
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
                                <Text className="text-xs text-muted-foreground">Days Missed: {item.daysMissed.join(", ")}</Text>
                                <Text className="text-xs text-muted-foreground">Match: {item.matchId}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </CardContent>
        </Card>
    );
}
