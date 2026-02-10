import { useQuery as useReactQuery, useQueryClient } from '@tanstack/react-query';
import { useConvex, useQuery as useConvexQuery } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';
import { useEffect } from 'react';

/**
 * Hybrid hook that combines real-time Convex subscriptions with React Query persistence.
 * 
 * Strategy:
 * 1. Load from Cache (React Query/AsyncStorage) -> Instant mount.
 * 2. Subscribe to Live Data (Convex) -> Updates in background.
 * 3. Sync Live Data -> Cache -> Updates persist for next time.
 * 
 * Result: Instant load + Real-time updates + Offline support.
 * No manual cache invalidation required!
 */
export function useCachedConvexQuery<Query extends FunctionReference<'query'>>(
    queryKey: string[],
    query: Query,
    args?: any,
    options: { enabled?: boolean } = { enabled: true }
) {
    const convex = useConvex();
    const queryClient = useQueryClient();
    const isEnabled = options.enabled !== false;

    // 1. Live Subscription (Real-time source of truth)
    // This will automatically update whenever backend data changes
    // Conditional subscription: pass "skip" if disabled (Convex React hook pattern)
    const liveData = useConvexQuery(query, isEnabled ? (args ?? undefined) : "skip");

    // 2. Persistent Cache (Offline/Startup source)
    // We set staleTime to Infinity because we rely on the live subscription for updates
    // We only use this to read the initial persisted data from disk
    const { data: cachedData, ...queryResult } = useReactQuery({
        queryKey: [...queryKey, args],
        queryFn: async () => {
            // Only fetch if we really have to (e.g. no cache and no live data yet)
            // But usually this won't run often if we rely on initialData from persistence
            if (liveData !== undefined) return liveData as FunctionReturnType<Query>;

            // If disabled, don't fetch from Convex, just return what we have (undefined if nothing)
            if (!isEnabled) return undefined;

            return await convex.query(query, args ?? undefined);
        },
        staleTime: Infinity, // Important: Don't auto-refetch, let Convex drive updates
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        enabled: isEnabled // Also control React Query fetching
    });

    // 3. Sync: When live data arrives, update the persistent cache
    useEffect(() => {
        if (liveData !== undefined) {
            queryClient.setQueryData([...queryKey, args], liveData);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveData, JSON.stringify(queryKey), JSON.stringify(args), queryClient]);

    // 4. Return the best available data
    // Prefer live data, fall back to cached data (for instant load), then undefined (loading)
    // If disabled and we have cached data, return cached data.
    const data = liveData !== undefined ? liveData : cachedData;

    return { ...queryResult, data, isLoading: data === undefined };
}
