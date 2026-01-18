import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { AlertCircleIcon, ChevronRightIcon, ClockIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';

export default function ReportsScreen() {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = useState<"pending" | "resolved" | "dismissed" | undefined>("pending");

    const reports = useQuery(api.reports.listReports, { status: statusFilter });

    const getTypeColor = (type: string) => {
        switch (type) {
            case "toxic_user": return "text-red-600";
            case "app_spam": return "text-orange-600";
            case "dispute": return "text-yellow-600";
            default: return "text-gray-600";
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case "toxic_user": return "Toxic User";
            case "app_spam": return "App Spam";
            case "dispute": return "Dispute";
            default: return "Other";
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['left', 'right', 'bottom']}>
            {/* Header */}
            <View className="px-6 pt-6 pb-4">
                <Text className="text-3xl font-extrabold text-foreground tracking-tight">Reports</Text>
                <Text className="text-sm text-muted-foreground mt-0.5">Manage user and app reports</Text>
            </View>

            {/* Filter Tabs */}
            <View className="flex-row px-6 mb-4 gap-2">
                <TouchableOpacity
                    onPress={() => setStatusFilter("pending")}
                    className={`px-4 py-2 rounded-full ${statusFilter === "pending" ? "bg-primary" : "bg-card border border-border"}`}
                >
                    <Text className={`font-semibold ${statusFilter === "pending" ? "text-primary-foreground" : "text-foreground"}`}>
                        Pending
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setStatusFilter("resolved")}
                    className={`px-4 py-2 rounded-full ${statusFilter === "resolved" ? "bg-primary" : "bg-card border border-border"}`}
                >
                    <Text className={`font-semibold ${statusFilter === "resolved" ? "text-primary-foreground" : "text-foreground"}`}>
                        Resolved
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setStatusFilter("dismissed")}
                    className={`px-4 py-2 rounded-full ${statusFilter === "dismissed" ? "bg-primary" : "bg-card border border-border"}`}
                >
                    <Text className={`font-semibold ${statusFilter === "dismissed" ? "text-primary-foreground" : "text-foreground"}`}>
                        Dismissed
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setStatusFilter(undefined)}
                    className={`px-4 py-2 rounded-full ${statusFilter === undefined ? "bg-primary" : "bg-card border border-border"}`}
                >
                    <Text className={`font-semibold ${statusFilter === undefined ? "text-primary-foreground" : "text-foreground"}`}>
                        All
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
                {!reports ? (
                    <Text className="text-center text-muted-foreground mt-8">Loading...</Text>
                ) : reports.length === 0 ? (
                    <View className="items-center mt-12">
                        <Icon as={AlertCircleIcon} className="text-muted-foreground size-12 mb-3" />
                        <Text className="text-muted-foreground">No reports found</Text>
                    </View>
                ) : (
                    reports.map((report) => (
                        <TouchableOpacity
                            key={report._id}
                            onPress={() => router.push(`/admin/report-details?id=${report._id}`)}
                        >
                            <Card className="border-border shadow-sm mb-3">
                                <CardContent className="p-4">
                                    <View className="flex-row items-start justify-between mb-2">
                                        <View className="flex-1">
                                            <View className="flex-row items-center gap-2 mb-1">
                                                <View className="bg-muted px-2 py-0.5 rounded">
                                                    <Text className={`text-xs font-bold ${getTypeColor(report.type)}`}>
                                                        {getTypeLabel(report.type)}
                                                    </Text>
                                                </View>
                                                {report.status === "pending" && (
                                                    <View className="bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                                                        <Text className="text-yellow-700 dark:text-yellow-400 text-xs font-bold">Pending</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text className="font-semibold text-foreground">
                                                Report by {report.reporterName}
                                            </Text>
                                            {report.reportedUserName && (
                                                <Text className="text-sm text-muted-foreground">
                                                    Against user: {report.reportedUserName}
                                                </Text>
                                            )}
                                            {report.reportedAppTitle && (
                                                <Text className="text-sm text-muted-foreground">
                                                    App: {report.reportedAppTitle}
                                                </Text>
                                            )}
                                        </View>
                                        <Icon as={ChevronRightIcon} className="text-muted-foreground size-5" />
                                    </View>

                                    <Text className="text-sm text-foreground mb-2" numberOfLines={2}>
                                        {report.description}
                                    </Text>

                                    <View className="flex-row items-center gap-1">
                                        <Icon as={ClockIcon} className="text-muted-foreground size-3" />
                                        <Text className="text-xs text-muted-foreground">
                                            {format(report.createdAt, "MMM d, yyyy 'at' h:mm a")}
                                        </Text>
                                    </View>
                                </CardContent>
                            </Card>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
