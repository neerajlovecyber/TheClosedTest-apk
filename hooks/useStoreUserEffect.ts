import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@/lib/api";
import { useSyncUser } from "@/lib/api-hooks";

export function useStoreUserEffect() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const syncUser = useSyncUser();

  useEffect(() => {
    // Wire up Clerk auth token generator for all backend requests
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!user) return;

    async function createUser() {
      try {
        const synced = await syncUser.mutateAsync({
          name: user?.fullName || user?.firstName || "Developer",
          email: user?.primaryEmailAddress?.emailAddress || "",
          avatarUrl: user?.imageUrl,
        });
        setUserId(synced.id);
      } catch (e) {
        console.warn("Failed to sync user with backend:", e);
      }
    }

    createUser();
    return () => setUserId(null);
  }, [user]);

  return userId;
}
