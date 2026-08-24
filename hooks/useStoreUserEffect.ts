import { useAuth, useUser } from "@clerk/expo";
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
    setAuthTokenGetter(async () => {
      const token = await getToken();
      return token || user?.id || null;
    });
  }, [getToken, user?.id]);

  useEffect(() => {
    if (!user) return;

    const currentUser = user;

    async function createUser() {
      try {
        const email = currentUser.primaryEmailAddress?.emailAddress || currentUser.emailAddresses?.[0]?.emailAddress || `${currentUser.id}@theclosedtest.app`;

        const synced = await syncUser.mutateAsync({
          tokenIdentifier: currentUser.id,
          name: currentUser.fullName || currentUser.firstName || currentUser.username || "Developer",
          email: email,
          avatarUrl: currentUser.imageUrl || undefined,
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
