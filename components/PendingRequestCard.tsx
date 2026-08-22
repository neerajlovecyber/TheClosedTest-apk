import React from "react";
import { View, Image, TouchableOpacity } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CheckIcon, XIcon, ArrowRightLeftIcon } from "lucide-react-native";

interface PendingRequestCardProps {
  request: {
    _id: string;
    requestor?: {
      name?: string;
      avatarUrl?: string;
    };
    user1?: {
      name?: string;
      email?: string;
      avatarUrl?: string;
    };
    offeredApp?: {
      _id?: string;
      id?: string;
      title?: string;
      currentTesters?: number;
      requiredTesters?: number;
      status?: string;
    };
    app1?: {
      _id?: string;
      id?: string;
      title?: string;
      currentTesters?: number;
      requiredTesters?: number;
      status?: string;
    };
    myApp?: {
      _id?: string;
      id?: string;
      title?: string;
      currentTesters?: number;
      requiredTesters?: number;
      status?: string;
    };
    app2?: {
      _id?: string;
      id?: string;
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
  const requestor = request.requestor || {
    name: request.user1?.name || request.user1?.email?.split("@")[0] || "Community Developer",
    avatarUrl: request.user1?.avatarUrl,
  };
  const offeredApp = request.offeredApp || request.app1;
  const myApp = request.myApp || request.app2;
  const offeredAppId = offeredApp?._id || offeredApp?.id;

  return (
    <Card className="border-border bg-card shadow-sm mb-0 w-[300px] mr-3">
      <CardContent className="p-3">
        {/* Header: User Info */}
        <View className="flex-row items-center gap-2 mb-3">
          <Image source={{ uri: requestor?.avatarUrl || "https://github.com/shadcn.png" }} className="w-8 h-8 rounded-full bg-muted border border-border" />
          <View className="flex-1">
            <Text className="font-bold text-sm text-foreground leading-tight" numberOfLines={1}>
              {requestor?.name || "Community Developer"}
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
              <TouchableOpacity onPress={() => onAppPress && offeredAppId && onAppPress(offeredAppId)} activeOpacity={0.7}>
                <Text className="font-semibold text-xs text-primary underline" numberOfLines={1}>
                  {offeredApp?.title || "Partner App"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Swap Icon */}
            <View className="px-2">
              <Icon as={ArrowRightLeftIcon} className="text-muted-foreground size-3 shrink-0" />
            </View>

            {/* Your App */}
            <View className="flex-1 items-end">
              <Text className="text-[9px] uppercase text-muted-foreground font-bold mb-0.5">For Your</Text>
              <Text className="font-semibold text-xs text-foreground" numberOfLines={1}>
                {myApp?.title || "Unknown App"}
              </Text>
              {myApp && (
                <Text
                  className={`text-[10px] ${myApp.currentTesters !== undefined && myApp.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters ? "text-destructive font-bold" : "text-muted-foreground"}`}
                >
                  {myApp.currentTesters ?? 0}/{myApp.requiredTesters ?? 20} Testers
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Status Warning if full */}
        {myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters && (
          <View className="bg-destructive/10 p-1.5 rounded-md mb-2 items-center">
            <Text className="text-[10px] font-bold text-destructive">Cannot Accept - Your App is at Capacity</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-2">
          <Button variant="destructive" size="sm" className="flex-1 h-8 px-0 shadow-sm" onPress={() => onReject(request._id)}>
            <Icon as={XIcon} className="size-3.5 text-white mr-1.5" />
            <Text className="text-white font-semibold text-xs">Decline</Text>
          </Button>

          <Button
            size="sm"
            className={`flex-1 h-8 px-0 shadow-sm ${
              myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters
                ? "bg-muted opacity-50"
                : "bg-primary shadow-primary/20"
            }`}
            onPress={() => onAccept(request._id)}
            disabled={
              myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters
            }
          >
            <Icon
              as={CheckIcon}
              className={`size-3.5 mr-1.5 ${
                myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters
                  ? "text-muted-foreground"
                  : "text-primary-foreground"
              }`}
            />
            <Text
              className={`${
                myApp?.currentTesters !== undefined && myApp?.requiredTesters !== undefined && myApp.currentTesters >= myApp.requiredTesters
                  ? "text-muted-foreground"
                  : "text-primary-foreground"
              } font-semibold text-xs`}
            >
              Accept
            </Text>
          </Button>
        </View>

      </CardContent>
    </Card>
  );
}
