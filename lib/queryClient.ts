import { QueryClient, focusManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';

/**
 * Global AppState Focus Manager for React Native
 * Automatically triggers background refetches when user opens the app or returns from background.
 */
focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
        if (Platform.OS !== 'web') {
            handleFocus(status === 'active');
        }
    });
    return () => subscription.remove();
});

/**
 * React Query client configured for high-performance REST/Postgres backend.
 * 
 * - gcTime: 24 hours (how long unused data stays cached on device)
 * - staleTime: 5 seconds (instant cached render + background refresh for real-time state)
 * - refetchOnMount: true (always fetch latest data when opening screen)
 * - refetchOnReconnect: true (immediate sync when internet connection restores)
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            staleTime: 1000 * 5, // 5 seconds
            refetchOnMount: true,
            refetchOnReconnect: true,
            retry: 2,
        },
    },
});

/**
 * AsyncStorage persister for React Query cache.
 * Saves query results to device storage for instant loads on app restart.
 */
export const persister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'APP_QUERY_CACHE',
    throttleTime: 1000, // Save to storage at most once per second
});

// Initialize persistence (for React Native, we use persistQueryClient directly)
persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
});
