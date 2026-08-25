import React, { useState, useEffect, useCallback } from "react";
import { View, TouchableOpacity, Linking, Platform, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { BellIcon, XIcon, CheckIcon } from "lucide-react-native";
import { useUpdatePushToken } from "@/lib/api-hooks";
import { toast } from "@/lib/sonner";
import Constants from "expo-constants";

const DISMISSED_KEY = "notification_banner_dismissed_v1";

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const updatePushToken = useUpdatePushToken();

  const checkPermission = useCallback(async () => {
    if (!Device.isDevice) {
      setVisible(false);
      return;
    }

    try {
      const isDismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      if (isDismissed === "true") {
        setVisible(false);
        return;
      }

      const { status } = await Notifications.getPermissionsAsync();
      setVisible(status !== "granted");
    } catch {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    checkPermission();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkPermission]);

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const { status: currentStatus, canAskAgain } = await Notifications.getPermissionsAsync();

      let finalStatus = currentStatus;
      if (currentStatus !== "granted" && canAskAgain) {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      } else if (currentStatus !== "granted" && !canAskAgain) {
        // Direct to OS App Settings
        if (Platform.OS === "android") {
          await Linking.openSettings();
        } else {
          await Linking.openURL("app-settings:");
        }
        setIsRequesting(false);
        return;
      }

      if (finalStatus === "granted") {
        // Instant visual dismissal
        setVisible(false);
        toast.success("Notifications Enabled! 🔔", {
          description: "You will receive instant swap and review alerts.",
        });

        // Background token registration
        (async () => {
          try {
            const projectId =
              Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            if (tokenData?.data) {
              await updatePushToken.mutateAsync(tokenData.data);
            }
          } catch (e) {
            console.error("Failed to register push token in background:", e);
          }
        })();
      }
    } catch (err) {
      console.error("Failed to enable push notifications:", err);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, "true");
    } finally {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <View className="mx-6 mb-4 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex-row items-start shadow-sm relative">
      <View className="flex-row items-start gap-3 flex-1 pr-6">
        <View className="w-9 h-9 rounded-full bg-primary/20 items-center justify-center mt-0.5">
          <Icon as={BellIcon} className="size-5 text-primary" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-foreground">Enable Testing Alerts</Text>
          <Text className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Get instant push alerts when a swap request arrives or your proof is approved.
          </Text>
          <View className="flex-row items-center gap-2 mt-2.5">
            <Button
              size="sm"
              className="bg-primary rounded-xl px-3 py-1.5 h-auto"
              onPress={handleEnable}
              disabled={isRequesting}
            >
              <Text className="text-primary-foreground font-bold text-xs">
                {isRequesting ? "Enabling..." : "Turn On Alerts"}
              </Text>
            </Button>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleDismiss}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-secondary/80 items-center justify-center active:bg-secondary"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon as={XIcon} className="size-3.5 text-muted-foreground" />
      </TouchableOpacity>
    </View>
  );
}
