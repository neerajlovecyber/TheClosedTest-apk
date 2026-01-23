import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to invalidate React Query caches after mutations.
 * Call this after any mutation that changes data to force a refetch.
 */
export function useInvalidateQueries() {
    const queryClient = useQueryClient();

    return {
        // Invalidate all app-related queries
        invalidateApps: () => {
            queryClient.invalidateQueries({ queryKey: ['myApps'] });
            queryClient.invalidateQueries({ queryKey: ['marketplaceRecruiting'] });
            queryClient.invalidateQueries({ queryKey: ['marketplaceFilled'] });
        },

        // Invalidate all match/request-related queries
        invalidateMatches: () => {
            queryClient.invalidateQueries({ queryKey: ['incomingRequests'] });
            queryClient.invalidateQueries({ queryKey: ['activeTests'] });
            queryClient.invalidateQueries({ queryKey: ['matchStatus'] });
            queryClient.invalidateQueries({ queryKey: ['matchDetails'] });
        },

        // Invalidate specific app details
        invalidateAppDetails: (appId: string) => {
            queryClient.invalidateQueries({ queryKey: ['appDetails', appId] });
        },

        // Invalidate current user
        invalidateUser: () => {
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        },

        // Invalidate everything (use sparingly)
        invalidateAll: () => {
            queryClient.invalidateQueries();
        },
    };
}
