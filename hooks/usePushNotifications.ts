import { useState, useEffect, useRef, useCallback } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform, AppState } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  const [notificationResponse, setNotificationResponse] = useState<Notifications.NotificationResponse | undefined>(undefined);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  const registerForPushNotificationsAsync = useCallback(async () => {
    let token;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    if (Device.isDevice) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        // Permission not granted; handled contextually via in-app banner
        return undefined;
      }

      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        token = (
          await Notifications.getExpoPushTokenAsync({
            projectId,
          })
        ).data;
      } catch (e) {
        console.warn("Error fetching push token:", e);
      }
    } else {
      console.log("Must use physical device for Push Notifications");
    }

    return token;
  }, []);

  const refreshToken = useCallback(async () => {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      setExpoPushToken(token);
    }
    return token;
  }, [registerForPushNotificationsAsync]);

  useEffect(() => {
    // Initial fetch on mount
    refreshToken();

    // 1. Listen for background push token rotation from OS/Firebase
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      if (token?.data) {
        setExpoPushToken(token.data);
      }
    });

    // 2. Listen for incoming notifications in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    // 3. Listen for notification interaction/taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification tapped:", response);
      setNotificationResponse(response);
    });

    // 4. Auto-sync push token whenever app returns to active foreground
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshToken();
      }
    });

    return () => {
      tokenSubscription.remove();
      appStateSub.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [refreshToken]);

  return { expoPushToken, notification, notificationResponse, refreshToken };
}
