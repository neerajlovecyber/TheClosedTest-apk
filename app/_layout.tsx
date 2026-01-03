
import '@/global.css';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import * as React from 'react';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

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
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <InitialLayout />
          <PortalHost />
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

SplashScreen.preventAutoHideAsync();

import { useStoreUserEffect } from '@/hooks/useStoreUserEffect';

function InitialLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Sync user with Convex
  useStoreUserEffect();

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

  React.useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/welcome" options={{ headerShown: false }} />
      <Stack.Screen name="add-app" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="app-details/[id]" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
