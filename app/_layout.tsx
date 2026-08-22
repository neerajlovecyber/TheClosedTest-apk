import '@/global.css'; // This must be first
import { Text, TextInput, Linking } from 'react-native';

import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

// Disable system font scaling
if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
(Text as any).defaultProps.allowFontScaling = false;

if ((TextInput as any).defaultProps == null) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.allowFontScaling = false;

import Toast from 'react-native-toast-message';
import { toastConfig } from '@/components/ToastConfig';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';

import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as React from 'react';
import { useOTAUpdate } from '@/hooks/useOTAUpdate';
import { useInAppUpdate } from '@/hooks/useInAppUpdate';
import { ForceUpdateDialog } from '@/components/ForceUpdateDialog';
import { WarningDisplay } from '@/components/WarningDisplay';
import AppDeletedModal from '@/components/AppDeletedModal';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useStoreUserEffect } from '@/hooks/useStoreUserEffect';
import { useUpdatePushToken } from '@/lib/api-hooks';
import { vexo, identifyDevice } from 'vexo-analytics';

const VEXO_API_KEY = process.env.EXPO_PUBLIC_VEXO_API_KEY || '4beaa20e-2695-4263-aa86-5ddaf7ff29ee';
if (VEXO_API_KEY) {
  vexo(VEXO_API_KEY);
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const theme = await AsyncStorage.getItem('theme');
        if (theme === 'dark' || theme === 'light') {
          setColorScheme(theme);
        }
      } catch (e) {
        console.log('Error loading theme:', e);
      } finally {
        setIsColorSchemeLoaded(true);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (isColorSchemeLoaded && colorScheme) {
      AsyncStorage.setItem('theme', colorScheme).catch((err) => {
        console.log('Error saving theme:', err);
      });
    }
  }, [colorScheme, isColorSchemeLoaded]);

  if (!isColorSchemeLoaded) {
    return null;
  }

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
          <KeyboardProvider statusBarTranslucent>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <InitialLayout />
            <PortalHost />
            <Toast config={toastConfig} topOffset={60} />
          </KeyboardProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

SplashScreen.preventAutoHideAsync();

function InitialLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Sync user with backend
  const syncedUserId = useStoreUserEffect();

  /* eslint-disable react-hooks/exhaustive-deps */
  const { expoPushToken, notificationResponse } = usePushNotifications();
  const updatePushToken = useUpdatePushToken();

  React.useEffect(() => {
    if (expoPushToken && isSignedIn && syncedUserId) {
      updatePushToken.mutateAsync(expoPushToken).catch((e) =>
        console.error('Failed to save push token:', e),
      );
    }
    if (syncedUserId) {
      identifyDevice(syncedUserId);
    }
  }, [expoPushToken, isSignedIn, syncedUserId]);

  React.useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isSignedIn && inAuthGroup) {
      // Redirect to tabs if signed in and in auth group
      router.replace('/(tabs)');
    } else if (!isSignedIn && !inAuthGroup) {
      // Redirect to welcome if not signed in
      router.replace('/(auth)/welcome');
    }
  }, [isSignedIn, isLoaded, segments]);

  // Handle Notification Navigation Safely
  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !notificationResponse) return;

    try {
      const data = notificationResponse.notification.request.content.data as Record<string, unknown> | undefined;
      console.log('Handling notification navigation:', data);

      if (data?.type === 'request' || data?.type === 'match_request') {
        router.push('/(tabs)');
      } else if (data?.matchId) {
        if (data.type === 'message') {
          router.push({ pathname: '/(tabs)/match/[id]', params: { id: data.matchId as string, tab: 'chat' } });
        } else {
          router.push({ pathname: '/(tabs)/match/[id]', params: { id: data.matchId as string } });
        }
      } else if (data?.type === 'new_app' && data.appId) {
        router.push(`/app-details/${data.appId}`);
      } else if (data?.type === 'admin_chat') {
        router.push('/admin-chat');
      } else if (data?.type === 'open_url' && data.url) {
        Linking.openURL(data.url as string).catch((err) =>
          console.error('Failed to open URL:', err),
        );
      }
    } catch (e) {
      console.error('Failed to navigate from notification:', e);
    }
  }, [notificationResponse, isLoaded, isSignedIn]);

  React.useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  // Handle OTA Updates
  const { isUpdateDownloaded, reloadApp } = useOTAUpdate();

  // Handle Native In-App Updates
  useInAppUpdate();

  if (!isLoaded) {
    return null;
  }

  return (
    <>
      <ForceUpdateDialog isVisible={isUpdateDownloaded} onReload={reloadApp} />
      <WarningDisplay />
      <AppDeletedModal />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="add-app" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="app-details/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="boost-hub" options={{ headerShown: false }} />
        <Stack.Screen name="admin/chats-list" options={{ headerShown: false }} />
        <Stack.Screen name="admin/analytics" options={{ headerShown: false }} />
        <Stack.Screen name="admin/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="admin/debug-push" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
