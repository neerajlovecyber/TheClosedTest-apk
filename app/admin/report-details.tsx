import React from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { AlertCircleIcon, BanIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon, MessageSquareIcon, UserIcon, ExternalLinkIcon } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { toast } from '@/lib/sonner';
import { Linking } from 'react-native';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ReasonDialog } from '@/components/ReasonDialog';
import { ReportDialog } from '@/components/ReportDialog';

export default function ReportDetailsScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [reportDialogVisible, setReportDialogVisible] = React.useState(false);

    const reportDetails = useQuery(api.reports.getReportDetails, id ? { reportId: id as any } : "skip");
    const banUser = useMutation(api.moderation.banUser);
    const banApp = useMutation(api.moderation.banApp);
    const warnUser = useMutation(api.moderation.warnUser);
    const resolveReport = useMutation(api.moderation.resolveReport);

    const handleBanUser = (userId: any, userName: string) => {
        Alert.alert(
            "Ban User",
            `Are you sure you want to permanently ban ${userName}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Ban",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await banUser({
                                userId,
                                reason: `Banned via report: ${reportDetails?.report.description || "No description"}`,
                                permanent: true,
                            });
                            await resolveReport({
                                reportId: id as any,
                                status: "resolved",
                                actionTaken: `Banned user: ${userName}`,
                            });
                            toast.success(`User ${userName} has been banned`);
                            router.back();
                        } catch (error: any) {
                            toast.error("Failed to ban user", { description: error.message });
                        }
                    },
                },
            ]
        );
    };

    const [warningDialogVisible, setWarningDialogVisible] = React.useState(false);
    const [warningTarget, setWarningTarget] = React.useState<{ id: any, name: string } | null>(null);

    const handleWarnConfirm = async (reason: string) => {
        if (!warningTarget) return;
        setWarningDialogVisible(false);

        try {
            await warnUser({
                userId: warningTarget.id,
                reason,
            });
            await resolveReport({
                reportId: id as any,
                status: "resolved",
                actionTaken: `Warned user: ${warningTarget.name}`,
            });
            toast.success(`Warning issued to ${warningTarget.name}`);
            router.back();
        } catch (error: any) {
            toast.error("Failed to warn user", { description: error.message });
        }
    };

    const handleBanApp = (appId: any, appTitle: string) => {
        Alert.alert(
            "Ban App",
            `Are you sure you want to ban ${appTitle}? This will prevent it from being resubmitted.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Ban App",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await banApp({
                                appId,
                                reason: `Banned via report: ${reportDetails?.report.description || "No description"}`,
                            });
                            await resolveReport({
                                reportId: id as any,
                                status: "resolved",
                                actionTaken: `Banned app: ${appTitle}`,
                            });
                            toast.success(`App ${appTitle} has been banned`);
                            router.back();
                        } catch (error: any) {
                            toast.error("Failed to ban app", { description: error.message });
                        }
                    },
                },
            ]
        );
    };

    const handleDismiss = async () => {
        try {
            await resolveReport({
                reportId: id as any,
                status: "dismissed",
                adminNotes: "Report dismissed - no action needed",
            });
            toast.success("Report dismissed");
            router.back();
        } catch (error: any) {
            toast.error("Failed to dismiss report", { description: error.message });
        }
    };

    if (!reportDetails) {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <Text className="text-muted-foreground">Loading...</Text>
            </SafeAreaView>
        );
    }

    const { report, reporter, reportedUser, reportedApp, matchDetails, userHistory } = reportDetails;

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right', 'bottom']}>
            <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Report Info */}
                <Card className="border-border shadow-sm mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle>Report Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <View className="mb-2">
                            <Text className="text-sm text-muted-foreground">Type</Text>
                            <Text className="font-semibold text-foreground capitalize">{report.type.replace('_', ' ')}</Text>
                        </View>
                        <View className="mb-2">
                            <Text className="text-sm text-muted-foreground">Reported by</Text>
                            <Text className="font-semibold text-foreground">{reporter?.name || "Unknown"}</Text>
                        </View>
                        <View className="mb-2">
                            <Text className="text-sm text-muted-foreground">Description</Text>
                            <Text className="text-foreground">{report.description}</Text>
                        </View>
                        <View>
                            <Text className="text-sm text-muted-foreground">Submitted</Text>
                            <Text className="text-foreground">{format(report.createdAt, "MMM d, yyyy 'at' h:mm a")}</Text>
                        </View>
                    </CardContent>
                </Card>

                {/* Reported User Info */}
                {reportedUser && (
                    <Card className="border-border shadow-sm mb-4 ">
                        <CardHeader className="">
                            <CardTitle>Reported User</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <View className="mb-2 ">
                                <Text className="text-sm text-muted-foreground">Name</Text>
                                <Text className="font-semibold text-foreground">{reportedUser.name}</Text>
                            </View>
                            <View className="mb-2">
                                <Text className="text-sm text-muted-foreground">Email</Text>
                                <Text className="text-foreground">{reportedUser.email || "N/A"}</Text>
                            </View>
                            <View className="mb-2">
                                <Text className="text-sm text-muted-foreground">Reputation</Text>
                                <Text className="text-foreground">{reportedUser.reputation}</Text>
                            </View>
                            {userHistory && (
                                <>
                                    <View>
                                        <Text className="text-sm text-muted-foreground">Past Warnings</Text>
                                        <Text className="text-foreground">{userHistory.warnings.length}</Text>
                                    </View>
                                    <View className="mt-2">
                                        <Text className="text-sm text-muted-foreground">Past Bans</Text>
                                        <Text className="text-foreground">{userHistory.bans.length}</Text>
                                    </View>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* App Context (from match) */}
                {matchDetails?.app1 && (
                    <Card className="border-border shadow-sm mb-4">
                        <CardHeader className="pb-2">
                            <View className="flex-row items-center justify-between">
                                <CardTitle>App Being Tested</CardTitle>
                                <TouchableOpacity
                                    onPress={() => {
                                        const url = matchDetails.app1?.playStoreUrl;
                                        if (url) Linking.openURL(url);
                                    }}
                                    className="flex-row items-center gap-1 bg-primary px-3 py-1.5 rounded-lg"
                                >
                                    <Icon as={ExternalLinkIcon} className="text-primary-foreground size-3" />
                                    <Text className="text-primary-foreground font-semibold text-xs">Open</Text>
                                </TouchableOpacity>
                            </View>
                        </CardHeader>
                        <CardContent>
                            <View className="flex-row items-start gap-3 mb-3">
                                <ExpoImage
                                    source={{ uri: matchDetails.app1.iconUrl }}
                                    style={{ width: 60, height: 60, borderRadius: 12 }}
                                />
                                <View className="flex-1">
                                    <Text className="font-bold text-lg text-foreground">{matchDetails.app1.title}</Text>
                                    <Text className="text-xs text-muted-foreground">Package: {matchDetails.app1.packageName}</Text>
                                </View>
                            </View>

                            <View className="mb-2">
                                <Text className="text-sm text-muted-foreground">Package Name</Text>
                                <Text className="text-foreground font-mono text-xs">{matchDetails.app1.packageName}</Text>
                            </View>

                            <View className="mb-2">
                                <Text className="text-sm text-muted-foreground">Play Store URL</Text>
                                <Text className="text-foreground text-xs" numberOfLines={2}>{matchDetails.app1.playStoreUrl}</Text>
                            </View>

                            {matchDetails.app1.instructions && (
                                <View>
                                    <Text className="text-sm text-muted-foreground">Testing Instructions</Text>
                                    <Text className="text-foreground text-sm">{matchDetails.app1.instructions}</Text>
                                </View>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Reported App Info */}
                {reportedApp && (
                    <Card className="border-border shadow-sm mb-4">
                        <CardHeader className="pb-2">
                            <View className="flex-row items-center justify-between">
                                <CardTitle>Reported App (Direct Report)</CardTitle>
                                <TouchableOpacity
                                    onPress={() => {
                                        const url = reportedApp?.playStoreUrl;
                                        if (url) Linking.openURL(url);
                                    }}
                                    className="flex-row items-center gap-1 bg-primary px-3 py-1.5 rounded-lg"
                                >
                                    <Icon as={ExternalLinkIcon} className="text-primary-foreground size-3" />
                                    <Text className="text-primary-foreground font-semibold text-xs">Open</Text>
                                </TouchableOpacity>
                            </View>
                        </CardHeader>
                        <CardContent>
                            <View className="flex-row items-start gap-3 mb-3">
                                <ExpoImage
                                    source={{ uri: reportedApp.iconUrl }}
                                    style={{ width: 60, height: 60, borderRadius: 12 }}
                                />
                                <View className="flex-1">
                                    <Text className="font-bold text-lg text-foreground">{reportedApp.title}</Text>
                                    <Text className="text-xs text-muted-foreground">Package: {reportedApp.packageName}</Text>
                                </View>
                            </View>

                            <View className="mb-2">
                                <Text className="text-sm text-muted-foreground">Package Name</Text>
                                <Text className="text-foreground font-mono text-xs">{reportedApp.packageName}</Text>
                            </View>

                            <View>
                                <Text className="text-sm text-muted-foreground">Play Store URL</Text>
                                <Text className="text-foreground text-xs" numberOfLines={2}>{reportedApp.playStoreUrl}</Text>
                            </View>
                        </CardContent>
                    </Card>
                )}

                {/* Conversation History */}
                {matchDetails && matchDetails.messages && matchDetails.messages.length > 0 && (
                    <Card className="border-border shadow-sm mb-4">
                        <CardHeader className="pb-2">
                            <CardTitle>Conversation History ({matchDetails.messages.length} messages)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {matchDetails.messages.slice(-10).map((msg: any) => (
                                <View key={msg._id} className="mb-3 pb-3 border-b border-border last:border-0">
                                    <View className="flex-row items-center gap-2 mb-1">
                                        <Icon as={UserIcon} className="text-muted-foreground size-3" />
                                        <Text className="text-xs font-semibold text-foreground">
                                            {msg.senderId === matchDetails.user1?._id
                                                ? matchDetails.user1?.name
                                                : matchDetails.user2?.name}
                                        </Text>
                                        <Text className="text-xs text-muted-foreground">
                                            {format(msg.sentAt, "MMM d, h:mm a")}
                                        </Text>
                                    </View>
                                    <Text className="text-foreground">{msg.content}</Text>
                                </View>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Action Buttons */}
                <View className="gap-3">
                    {reportedUser && (
                        <>
                            <TouchableOpacity
                                onPress={() => handleBanUser(reportedUser._id, reportedUser.name || "")}
                                className="bg-red-600 p-4 rounded-lg flex-row items-center justify-center gap-2"
                            >
                                <Icon as={BanIcon} className="text-white size-5" />
                                <Text className="text-white font-bold">Ban User: {reportedUser.name}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    setWarningTarget({ id: reportedUser._id, name: reportedUser.name || "User" });
                                    setWarningDialogVisible(true);
                                }}
                                className="bg-orange-600 p-4 rounded-lg flex-row items-center justify-center gap-2"
                            >
                                <Icon as={AlertTriangleIcon} className="text-white size-5" />
                                <Text className="text-white font-bold">Warn User: {reportedUser.name}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {reportedApp && (
                        <TouchableOpacity
                            onPress={() => handleBanApp(reportedApp._id, reportedApp.title)}
                            className="bg-red-600 p-4 rounded-lg flex-row items-center justify-center gap-2"
                        >
                            <Icon as={BanIcon} className="text-white size-5" />
                            <Text className="text-white font-bold">Ban App: {reportedApp.title}</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        onPress={handleDismiss}
                        className="bg-gray-600 p-4 rounded-lg flex-row items-center justify-center gap-2"
                    >
                        <Icon as={XCircleIcon} className="text-white size-5" />
                        <Text className="text-white font-bold">Dismiss Report</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <ReportDialog
                visible={reportDialogVisible}
                onClose={() => setReportDialogVisible(false)}
                reportType="app"
                targetId={matchDetails?.app1?._id || reportedApp?._id || ""}
                reportedAppId={matchDetails?.app1?._id || reportedApp?._id}
                targetName={matchDetails?.app1?.title || reportedApp?.title || "App"}
            />

            <ReasonDialog
                visible={warningDialogVisible}
                onClose={() => setWarningDialogVisible(false)}
                onConfirm={handleWarnConfirm}
                title={`Warn ${warningTarget?.name}`}
                placeholder="Enter reason for warning..."
                confirmText="Issue Warning"
                initialValue={`Warning via report: ${reportDetails?.report.description || ""}`}
            />
        </SafeAreaView>
    );
}
