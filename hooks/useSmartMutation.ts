import { useMutation as useConvexMutation } from 'convex/react';
import { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { useInvalidateQueries } from './useInvalidateQueries';

type InvalidationKey = 'apps' | 'matches' | 'all';

/**
 * A wrapper around useMutation that automatically invalidates queries on success.
 * 
 * @param mutation The Convex mutation function
 * @param invalidationGroups Array of groups to invalidate: 'apps' | 'matches' | 'all'
 */
export function useSmartMutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    invalidationGroups: InvalidationKey[] = []
) {
    const convexMutation = useConvexMutation(mutation);
    const { invalidateApps, invalidateMatches, invalidateAll } = useInvalidateQueries();

    return async (...args: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation>> => {
        try {
            const result = await convexMutation(...args);

            // Automatically invalidate caches based on groups
            if (invalidationGroups.includes('all')) {
                invalidateAll();
            } else {
                if (invalidationGroups.includes('apps')) invalidateApps();
                if (invalidationGroups.includes('matches')) invalidateMatches();
            }

            return result;
        } catch (error) {
            throw error;
        }
    };
}
