import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { CheckCircleIcon, XCircleIcon, ClockIcon, CircleIcon, CalendarIcon, TrophyIcon } from 'lucide-react-native';

interface DayData {
    day: number;
    isFuture: boolean;
    isToday: boolean;
    myStatus: string;
    partnerStatus: string;
    myProof?: {
        status: string;
        comment?: string;
        rejectionReason?: string;
        submittedAt?: number;
    } | null;
    partnerProof?: {
        status: string;
        comment?: string;
        submittedAt?: number;
    } | null;
}

interface ProgressGridProps {
    days: DayData[];
    currentDay: number;
    summary: {
        myApproved: number;
        partnerApproved: number;
        myPending: number;
        partnerPending: number;
        totalDays: number;
    };
    partnerName: string;
    myAppName: string;
    partnerAppName: string;
    onDayPress?: (day: number) => void;
}

function getStatusColor(status: string): string {
    switch (status) {
        case 'approved': return 'bg-green-500';
        case 'pending': return 'bg-orange-500';
        case 'rejected': return 'bg-red-500';
        case 'missed': return 'bg-gray-400';
        case 'future': return 'bg-gray-200';
        default: return 'bg-gray-300';
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'approved': return CheckCircleIcon;
        case 'pending': return ClockIcon;
        case 'rejected': return XCircleIcon;
        default: return CircleIcon;
    }
}

export function ProgressGrid({
    days,
    currentDay,
    summary,
    partnerName,
    myAppName,
    partnerAppName,
    onDayPress
}: ProgressGridProps) {

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            {/* Summary Cards */}
            {/* Unified Summary Card */}
            <Card className="mb-6 bg-secondary/10 border-border">
                <CardContent className="p-5 flex-row justify-between items-center">
                    {/* My Stats */}
                    <View className="flex-1 items-center">
                        <View className="flex-row items-center mb-1">
                            <Icon as={TrophyIcon} className="text-primary size-4 mr-1.5" />
                            <Text className="font-bold text-base text-primary">You</Text>
                        </View>
                        <Text className="text-3xl font-black text-foreground">
                            {summary.myApproved}<Text className="text-sm text-muted-foreground font-medium">/{summary.totalDays}</Text>
                        </Text>
                        <Text className="text-xs text-muted-foreground -mt-1 mb-1">Days Approved</Text>
                        {summary.myPending > 0 && (
                            <Text className="text-xs text-orange-600 font-medium bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                                {summary.myPending} pending
                            </Text>
                        )}
                    </View>

                    {/* Divider */}
                    <View className="h-16 w-px bg-border/50 mx-2" />

                    {/* Partner Stats */}
                    <View className="flex-1 items-center">
                        <View className="flex-row items-center mb-1">
                            <Text className="font-bold text-base text-muted-foreground">{partnerName.split(' ')[0]}</Text>
                        </View>
                        <Text className="text-3xl font-black text-foreground">
                            {summary.partnerApproved}<Text className="text-sm text-muted-foreground font-medium">/{summary.totalDays}</Text>
                        </Text>
                        <Text className="text-xs text-muted-foreground -mt-1 mb-1">Days Approved</Text>
                        {summary.partnerPending > 0 && (
                            <Text className="text-xs text-orange-600 font-medium bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                                {summary.partnerPending} pending
                            </Text>
                        )}
                    </View>
                </CardContent>
            </Card>

            {/* Legend */}
            <View className="flex-row flex-wrap gap-4 mb-4 px-1">
                <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-green-500 mr-1.5" />
                    <Text className="text-xs text-muted-foreground">Approved</Text>
                </View>
                <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-orange-500 mr-1.5" />
                    <Text className="text-xs text-muted-foreground">Pending</Text>
                </View>
                <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-red-500 mr-1.5" />
                    <Text className="text-xs text-muted-foreground">Rejected</Text>
                </View>
                <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-gray-400 mr-1.5" />
                    <Text className="text-xs text-muted-foreground">Missed</Text>
                </View>
            </View>

            {/* 14-Day Grid */}
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {days.map((dayData) => (
                    <TouchableOpacity
                        key={dayData.day}
                        onPress={() => onDayPress?.(dayData.day)}
                        disabled={dayData.isFuture}
                        className={`rounded-xl p-3 ${dayData.isToday ? 'border-2 border-primary' : ''} ${dayData.isFuture ? 'opacity-40' : ''}`}
                        style={{
                            width: '23%',
                            backgroundColor: dayData.isToday ? 'rgba(var(--primary), 0.1)' : 'rgba(0,0,0,0.03)'
                        }}
                    >
                        {/* Day Number */}
                        <Text className={`text-center font-bold text-lg ${dayData.isToday ? 'text-primary' : 'text-foreground'}`}>
                            {dayData.day}
                        </Text>

                        {/* Status Indicators (You vs Partner) */}
                        <View className="flex-row justify-center gap-1.5 mt-2">
                            {/* My Status */}
                            <View
                                className={`w-3.5 h-3.5 rounded-full ${getStatusColor(dayData.myStatus)}`}
                                style={{ borderWidth: 2, borderColor: 'white' }}
                            />
                            {/* Partner Status */}
                            <View
                                className={`w-3.5 h-3.5 rounded-full ${getStatusColor(dayData.partnerStatus)}`}
                                style={{ borderWidth: 2, borderColor: 'white' }}
                            />
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
}
