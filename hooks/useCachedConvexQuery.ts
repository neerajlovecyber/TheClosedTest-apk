import { useQuery as useReactQuery } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';

/**
 * Wrapper hook that combines Convex queries with React Query's persistent caching.
 * 
 * This provides:
 * - Instant loads on app restart (data cached in AsyncStorage)
 * - Automatic background refetching when data becomes stale
 * - Offline support (shows cached data when offline)
 * 
 * Note: This loses Convex's reactive subscriptions. Data only updates on:
 * - Component mount
 * - Manual refetch
 * - When staleTime expires (5 minutes by default)
 * 
 * @param queryKey - Unique identifier for this query (e.g., ['myApps'])
 * @param query - Convex query function reference
 * @param args - Arguments to pass to the Convex query
 * @returns React Query result with data, isLoading, error, etc.
 */
export function useCachedConvexQuery<Query extends FunctionReference<'query'>>(
    queryKey: string[],
    query: Query,
    args?: any
) {
    const convex = useConvex(); // Get the authenticated Convex client from context

    return useReactQuery({
        queryKey: [...queryKey, args],
        queryFn: async () => {
            try {
                // Use the authenticated Convex client to run the query
                // Convex queries expect args as rest parameters or undefined
                const result = await convex.query(query, args ?? undefined);
                console.log(`[useCachedConvexQuery] ${queryKey[0]} loaded:`, result);
                return result as FunctionReturnType<Query>;
            } catch (error) {
                console.error(`[useCachedConvexQuery] ${queryKey[0]} error:`, error);
                throw error;
            }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        retry: 2,
    });
}
