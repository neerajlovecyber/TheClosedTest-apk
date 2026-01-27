import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { CheckIcon, XIcon, ArrowRightLeftIcon } from 'lucide-react-native';

interface PendingRequestCardProps {
    request: {
        _id: string;
        requestor?: {
            name?: string;
            avatarUrl?: string;
        };
        offeredApp?: {
            _id?: string;
            title?: string;
            currentTesters?: number;
            requiredTesters?: number;
            status?: string;
        };
        myApp?: {
            title?: string;
            currentTesters?: number;
            requiredTesters?: number;
            status?: string;
        };
    };
    onAccept: (id: string) => void;
    onReject: (id: string) => void;
    onAppPress?: (appId: string) => void;
}

export function PendingRequestCard({ request, onAccept, onReject, onAppPress }: PendingRequestCardProps) {
    const { requestor, offeredApp, myApp } = request;

    return (
        <Card className="border-border bg-card shadow-sm mb-0 w-[300px] mr-3">
            <CardContent className="p-3">
                {/* Header: User Info */}
                <View className="flex-row items-center gap-2 mb-3">
                    <Image
                        source={{ uri: requestor?.avatarUrl || 'https://github.com/shadcn.png' }}
                        className="w-8 h-8 rounded-full bg-muted border border-border"
                    />
                    <View className="flex-1">
                        <Text className="font-bold text-sm text-foreground leading-tight" numberOfLines={1}>
                            {requestor?.name || 'Unknown User'}
                        </Text>
                        <Text className="text-[10px] text-muted-foreground">Wants to swap tests</Text>
                    </View>
                </View>

                {/* Exchange Details Box */}
                <View className="bg-secondary/30 rounded-md p-2 mb-3 border border-secondary/50">
                    <View className="flex-row items-center justify-between">
                        {/* Their Offer */}
                        <View className="flex-1">
                            <Text className="text-[9px] uppercase text-muted-foreground font-bold mb-0.5">They Offer</Text>
                            <TouchableOpacity
                                onPress={() => onAppPress && offeredApp?._id && onAppPress(offeredApp._id)}
                                activeOpacity={0.7}
                            >
                                <Text className="font-semibold text-xs text-primary underline" numberOfLines={1}>
                                    {offeredApp?.title || 'Unknown App'}
                                </Text>
                            </TouchableOpacity>
                            {offeredApp && (
                                <Text className={`text-[10px] ${offeredApp.currentTesters && offeredApp.requiredTesters && offeredApp.currentTesters >= offeredApp.requiredTesters ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                                    {offeredApp.currentTesters ?? 0}/{offeredApp.requiredTesters ?? 20} Testers
                                </Text>
                            )}
                        </View>

                        {/* Swap Icon */}
                        <View className="px-2">
                            <Icon as={ArrowRightLeftIcon} className="text-muted-foreground size-3 shrink-0" />
                        </View>

                        {/* Your App */}
                        <View className="flex-1 items-end">
                            <Text className="text-[9px] uppercase text-muted-foreground font-bold mb-0.5">For Your</Text>
                            <Text className="font-semibold text-xs text-foreground" numberOfLines={1}>
                                {myApp?.title || 'Unknown App'}
                            </Text>
                            {myApp && (
                                <Text className={`text-[10px] ${myApp.currentTesters && myApp.requiredTesters && myApp.currentTesters >= myApp.requiredTesters ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                                    {myApp.currentTesters ?? 0}/{myApp.requiredTesters ?? 20} Testers
                                </Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Status Warning if full */}
                {((offeredApp?.currentTesters !== undefined && offeredApp?.requiredTesters !== undefined && offeredApp.currentTesters >= offeredApp.requiredTesters) ||
                    (myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters)) && (
                        <View className="bg-destructive/10 p-1.5 rounded-md mb-2 items-center">
                            <Text className="text-[10px] font-bold text-destructive">
                                Cannot Accept - Capacity Reached
                            </Text>
                        </View>
                    )}

                {/* Action Buttons */}
                <View className="flex-row gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 px-0 border-destructive/30 hover:bg-destructive/10 active:bg-destructive/20"
                        onPress={() => onReject(request._id)}
                    >
                        <Icon as={XIcon} className="size-3.5 text-destructive mr-1.5" />
                        <Text className="text-destructive font-semibold text-xs">Decline</Text>
                    </Button>

                    <Button
                        size="sm"
                        className={`flex-1 h-8 px-0 shadow-sm ${((offeredApp?.currentTesters && offeredApp?.requiredTesters && offeredApp.currentTesters >= offeredApp.requiredTesters) ||
                            (myApp?.currentTesters && myApp?.requiredTesters && myApp.currentTesters >= myApp.requiredTesters))
                            ? 'bg-muted opacity-50'
                            : 'bg-primary shadow-primary/20'}`}
                        onPress={() => onAccept(request._id)}
                        disabled={
                            (offeredApp?.currentTesters !== undefined && offeredApp?.requiredTesters !== undefined && offeredApp.currentTesters >= offeredApp.requiredTesters) ||
                            (myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters)
                        }
                    >
                        <Icon as={CheckIcon} className={`size-3.5 mr-1.5 ${((offeredApp?.currentTesters && offeredApp?.requiredTesters && offeredApp.currentTesters >= offeredApp.requiredTesters) ||
                            (myApp?.currentTesters && myApp?.requiredTesters && myApp.currentTesters >= myApp.requiredTesters))
                            ? 'text-muted-foreground'
                            : 'text-primary-foreground'}`} />
                        <Text className={`${((offeredApp?.currentTesters && offeredApp?.requiredTesters && offeredApp.currentTesters >= offeredApp.requiredTesters) ||
                            (myApp?.currentTesters && myApp?.requiredTesters && myApp.currentTesters >= myApp.requiredTesters))
                            ? 'text-muted-foreground'
                            : 'text-primary-foreground'} font-semibold text-xs`}>Accept</Text>
                    </Button>
                </View>
            </CardContent>
        </Card>
    );
}
