import { useAuth, useUser } from "@clerk/clerk-expo";
import { useEffect, useState } from "react";
import { setAuthTokenGetter, setCurrentUserId } from "@/lib/api";
import { useSyncUser } from "@/lib/api-hooks";

export function useStoreUserEffect() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const syncUser = useSyncUser();

  useEffect(() => {
    setCurrentUserId(user?.id || null);
    // Wire up Clerk auth token generator for all backend requests
    setAuthTokenGetter(async () => {
      const token = await getToken();
      return token || user?.id || null;
    });
  }, [getToken, user?.id]);

  useEffect(() => {
    if (!user) return;

    async function createUser() {
      try {
        const email =
          user.primaryEmailAddress?.emailAddress ||
          user.emailAddresses?.[0]?.emailAddress ||
          `${user.id}@theclosedtest.app`;

        const synced = await syncUser.mutateAsync({
          tokenIdentifier: user.id,
          name: user.fullName || user.firstName || user.username || "Developer",
          email: email,
          avatarUrl: user.imageUrl || undefined,
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
