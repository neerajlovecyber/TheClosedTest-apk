import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';

interface ChartDataPoint {
    date: string;
    value: number;
    label: string;
}

interface SimpleBarChartProps {
    data: ChartDataPoint[];
    selectedDate: string | null;
    onSelectDate: (date: string | null) => void;
    barColor?: string;
}

export function SimpleBarChart({ data, selectedDate, onSelectDate, barColor = 'bg-primary' }: SimpleBarChartProps) {
    if (!data || data.length === 0) return null;

    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <View className="my-6 bg-card p-4 rounded-xl border border-border shadow-sm">
            <Text className="text-sm font-semibold mb-8 text-muted-foreground">
                Last 7 Days Activity
            </Text>
            <View className="flex-row items-end justify-between h-32 px-2">
                {data.map((d) => {
                    // Cap at 80% height to ensure the top label fits within the container and doesn't overlap the header
                    const heightPercentage = (d.value / maxValue) * 80;
                    const isSelected = selectedDate === d.date;

                    return (
                        <TouchableOpacity
                            key={d.date}
                            onPress={() => onSelectDate(isSelected ? null : d.date)}
                            className="items-center w-8"
                        >
                            <View className="w-full items-center justify-end h-full">
                                <View
                                    className="relative w-4"
                                    style={{ height: `${Math.max(heightPercentage, 10)}%` }}
                                >
                                    {d.value > 0 && (
                                        <Text className="absolute -top-5 left-0 right-0 text-center text-[10px] text-muted-foreground">
                                            {d.value}
                                        </Text>
                                    )}
                                    <View className={`w-full h-full rounded-t-sm ${isSelected ? barColor : `${barColor}/30`}`} />
                                </View>
                            </View>
                            <Text className={`text-[10px] mt-2 ${isSelected ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                {d.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}
