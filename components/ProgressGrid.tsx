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
            <View className="flex-row gap-3 mb-6">
                {/* My Progress */}
                <Card className="flex-1 bg-primary/10 border-primary/30">
                    <CardContent className="p-4">
                        <View className="flex-row items-center mb-2">
                            <Icon as={TrophyIcon} className="text-primary size-5 mr-2" />
                            <Text className="font-bold text-primary">You</Text>
                        </View>
                        <Text className="text-3xl font-extrabold text-foreground">
                            {summary.myApproved}<Text className="text-lg text-muted-foreground">/{summary.totalDays}</Text>
                        </Text>
                        <Text className="text-xs text-muted-foreground mt-1">Days Approved</Text>
                        {summary.myPending > 0 && (
                            <View className="flex-row items-center mt-2">
                                <View className="w-2 h-2 rounded-full bg-orange-500 mr-1" />
                                <Text className="text-xs text-orange-600">{summary.myPending} pending</Text>
                            </View>
                        )}
                    </CardContent>
                </Card>

                {/* Partner's Progress */}
                <Card className="flex-1 bg-secondary/30 border-secondary/50">
                    <CardContent className="p-4">
                        <View className="flex-row items-center mb-2">
                            <Icon as={TrophyIcon} className="text-muted-foreground size-5 mr-2" />
                            <Text className="font-bold text-muted-foreground">{partnerName}</Text>
                        </View>
                        <Text className="text-3xl font-extrabold text-foreground">
                            {summary.partnerApproved}<Text className="text-lg text-muted-foreground">/{summary.totalDays}</Text>
                        </Text>
                        <Text className="text-xs text-muted-foreground mt-1">Days Approved</Text>
                        {summary.partnerPending > 0 && (
                            <View className="flex-row items-center mt-2">
                                <View className="w-2 h-2 rounded-full bg-orange-500 mr-1" />
                                <Text className="text-xs text-orange-600">{summary.partnerPending} pending</Text>
                            </View>
                        )}
                    </CardContent>
                </Card>
            </View>

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
                                className={`w-4 h-4 rounded-full ${getStatusColor(dayData.myStatus)}`}
                                style={{ borderWidth: 2, borderColor: 'white' }}
                            />
                            {/* Partner Status */}
                            <View
                                className={`w-4 h-4 rounded-full ${getStatusColor(dayData.partnerStatus)}`}
                                style={{ borderWidth: 2, borderColor: 'white' }}
                            />
                        </View>

                        {/* Labels */}
                        <View className="flex-row justify-center gap-1 mt-1">
                            <Text className="text-[8px] text-muted-foreground">You</Text>
                            <Text className="text-[8px] text-muted-foreground">|</Text>
                            <Text className="text-[8px] text-muted-foreground">Them</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Current Day Info */}
            {currentDay <= 14 && (
                <Card className="mt-6 bg-primary/5 border-primary/20">
                    <CardContent className="p-4 flex-row items-center">
                        <Icon as={CalendarIcon} className="text-primary size-6 mr-3" />
                        <View className="flex-1">
                            <Text className="font-bold text-primary">Day {currentDay} of 14</Text>
                            <Text className="text-xs text-muted-foreground">
                                {14 - currentDay} days remaining in this testing period
                            </Text>
                        </View>
                    </CardContent>
                </Card>
            )}
        </ScrollView>
    );
}
