
import React, { memo, useMemo } from 'react';
import { View, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { CheckCircle2Icon, XCircleIcon, ClockIcon, LockIcon, AlertCircleIcon } from 'lucide-react-native';

type DayStatus = {
    day: number;
    isFuture: boolean;
    isToday: boolean;
    myStatus: string; // 'approved' | 'pending' | 'rejected' | 'missed' | 'future' | 'not_uploaded'
    partnerStatus: string;
    myProof: any;
    partnerProof: any;
};

interface ProgressGridProps {
    days: DayStatus[];
    currentDay: number;
    summary: {
        myApproved: number;
        partnerApproved: number;
        totalDays: number;
    };
}

// Memoized Status Indicator Component
const StatusDot = memo(({ status, isMe }: { status: string, isMe?: boolean }) => {
    const { color, icon, iconColor } = useMemo(() => {
        let color = "bg-muted/50";
        let icon = null as any;
        let iconColor = "text-muted-foreground";

        switch (status) {
            case 'approved':
                color = "bg-green-100 dark:bg-green-900/40";
                icon = CheckCircle2Icon;
                iconColor = "text-green-600 dark:text-green-400";
                break;
            case 'pending':
                color = "bg-orange-100 dark:bg-orange-900/40";
                icon = ClockIcon;
                iconColor = "text-orange-600 dark:text-orange-400";
                break;
            case 'rejected':
                color = "bg-red-100 dark:bg-red-900/40";
                icon = XCircleIcon;
                iconColor = "text-red-600 dark:text-red-400";
                break;
            case 'missed':
                color = "bg-destructive/10";
                icon = AlertCircleIcon;
                iconColor = "text-destructive";
                break;
            case 'future':
                color = "bg-secondary/30";
                icon = LockIcon;
                iconColor = "text-muted-foreground/30";
                break;
            case 'not_uploaded':
                color = "bg-secondary/30";
                break;
        }

        return { color, icon, iconColor };
    }, [status]);

    if ((status === 'not_uploaded' || status === 'future') && !icon) {
        return (
            <View className={`w-5 h-5 rounded-full ${color} items-center justify-center`}>
                <View className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            </View>
        );
    }

    return (
        <View className={`w-5 h-5 rounded-full ${color} items-center justify-center`}>
            {icon && <Icon as={icon} className={`size-3 ${iconColor}`} />}
        </View>
    );
});

function ProgressGridComponent({ days, currentDay, summary }: ProgressGridProps) {
    const { width } = useWindowDimensions();

    return (
        <View>
            {/* Unified Score Card Header */}
            <View className="mx-4 mb-4 p-4 rounded-xl bg-card border border-border shadow-sm flex-row justify-between items-center">
                <View className="items-center flex-1 border-r border-border/50">
                    <Text className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {summary.myApproved}/{summary.totalDays}
                    </Text>
                    <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">You Approved</Text>
                </View>
                <View className="items-center flex-1">
                    <Text className="text-3xl font-bold text-primary">
                        {summary.partnerApproved}/{summary.totalDays}
                    </Text>
                    <Text className="text-xs text-muted-foreground font-medium uppercase tracking-wide mt-1">Partner Approved</Text>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                className="flex-row"
            >
                {days.map((dayItem) => {
                    const isToday = dayItem.day === currentDay;

                    return (
                        <View
                            key={dayItem.day}
                            style={{ width: 85 }} // Fixed width for scrollable list
                            className={`p-2 mr-2 rounded-xl border aspect-[0.85] justify-between items-center ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                        >
                            <View className={`px-2 py-0.5 rounded-md mb-2 ${isToday ? 'bg-primary' : 'bg-secondary'}`}>
                                <Text className={`text-xs font-bold ${isToday ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                    Day {dayItem.day}
                                </Text>
                            </View>

                            <View className="flex-1 justify-center gap-1.5 w-full px-1">
                                {/* Row for You */}
                                <View className="flex-row items-center justify-between w-full">
                                    <Text className="text-[10px] text-muted-foreground">You</Text>
                                    <StatusDot status={dayItem.myStatus} isMe />
                                </View>
                                {/* Row for Partner */}
                                <View className="flex-row items-center justify-between w-full">
                                    <Text className="text-[10px] text-muted-foreground">Them</Text>
                                    <StatusDot status={dayItem.partnerStatus} />
                                </View>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Compact Legend */}
            <View className="mx-4 mt-3 bg-secondary/20 p-2 rounded-lg py-3">
                <View className="flex-row flex-wrap gap-x-4 gap-y-2 justify-center">
                    <View className="flex-row items-center gap-1.5">
                        <Icon as={CheckCircle2Icon} className="size-3 text-green-600" />
                        <Text className="text-[10px] text-muted-foreground">Approved</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <Icon as={ClockIcon} className="size-3 text-orange-600" />
                        <Text className="text-[10px] text-muted-foreground">Pending</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <Icon as={XCircleIcon} className="size-3 text-red-600" />
                        <Text className="text-[10px] text-muted-foreground">Rejected</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                        <Icon as={AlertCircleIcon} className="size-3 text-destructive" />
                        <Text className="text-[10px] text-muted-foreground">Missed</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

// Export memoized component
export const ProgressGrid = memo(ProgressGridComponent);
