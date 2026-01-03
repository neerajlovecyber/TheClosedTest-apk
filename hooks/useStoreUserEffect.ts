
import { useUser } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export function useStoreUserEffect() {
    const { user } = useUser();
    // Use a state to track if we have stored the user to avoid constant re-calls if not needed,
    // although the mutation is idempotent (checks for existence).
    const [userId, setUserId] = useState<Id<"users"> | null>(null);
    const storeUser = useMutation(api.users.store);

    useEffect(() => {
        // If the user is not logged in don't do anything
        if (!user) {
            return;
        }

        // Call the mutation to store the user
        async function createUser() {
            const id = await storeUser();
            setUserId(id);
        }

        createUser();
        return () => setUserId(null);
    }, [user, storeUser]);

    return userId;
}
