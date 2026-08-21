import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * React Query client configured for persistent caching.
 * 
 * - gcTime (garbage collection): 24 hours - how long unused data stays in cache
 * - staleTime: 5 minutes - how long data is considered fresh before refetching
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            staleTime: 1000 * 60 * 5, // 5 minutes - refetch after this time
            retry: 2, // Retry failed queries twice
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
