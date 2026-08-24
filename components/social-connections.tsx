import { toast } from "@/lib/sonner";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useSSO, type StartSSOFlowParams } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useColorScheme } from "nativewind";
import * as React from "react";
import { Image, Platform, View, type ImageSourcePropType } from "react-native";

WebBrowser.maybeCompleteAuthSession();

type SocialConnectionStrategy = Extract<StartSSOFlowParams["strategy"], "oauth_google" | "oauth_github" | "oauth_apple">;

const SOCIAL_CONNECTION_STRATEGIES: {
  type: SocialConnectionStrategy;
  source: ImageSourcePropType;
  useTint?: boolean;
}[] = [
  {
    type: "oauth_google",
    source: { uri: "https://img.clerk.com/static/google.png?width=160" },
    useTint: true,
  },
];

export function SocialConnections() {
  useWarmUpBrowser();
  const { colorScheme } = useColorScheme();
  const { startSSOFlow } = useSSO();

  function onSocialLoginPress(strategy: SocialConnectionStrategy) {
    return async () => {
      try {
        console.log("🔵 Starting Google OAuth flow...");
        const redirectUrl = AuthSession.makeRedirectUri();
        console.log("🔵 Starting Google OAuth flow with redirectUrl:", redirectUrl);
        // Start the authentication process by calling `startSSOFlow()`
        const { createdSessionId, setActive, signIn, signUp } = await startSSOFlow({
          strategy,
          redirectUrl,
        });

        console.log("🔵 OAuth flow returned:", {
          hasCreatedSessionId: !!createdSessionId,
          hasSetActive: !!setActive,
          signInStatus: signIn?.status,
          signUpStatus: signUp?.status,
        });

        // Check for session in any of the returned fields
        const sessionId = createdSessionId || signIn?.createdSessionId || signUp?.createdSessionId;
        if (sessionId && setActive) {
          console.log("✅ OAuth Success: Session active", sessionId);
          await setActive({ session: sessionId });
          return;
        }

        // Check if authentication needs transfer (e.g. new user sign up or sign in transfer)
        if (signIn?.firstFactorVerification?.status === "transferable") {
          console.log("🔵 Attempting to complete sign-up via transfer...");
          const res = await signUp?.create({ transfer: true });
          if (res?.createdSessionId && setActive) {
            console.log("✅ OAuth Success: SignUp transfer complete");
            await setActive({ session: res.createdSessionId });
            return;
          }
        }

        if (signUp?.verifications?.externalAccount?.status === "transferable") {
          console.log("🔵 Attempting to complete sign-in via transfer...");
          const res = await signIn?.create({ transfer: true });
          if (res?.createdSessionId && setActive) {
            console.log("✅ OAuth Success: SignIn transfer complete");
            await setActive({ session: res.createdSessionId });
            return;
          }
        }

        // Log detailed status for debugging
        console.log("SSO Flow incomplete:", {
          signInStatus: signIn?.status,
          signUpStatus: signUp?.status,
          signInFirstFactors: signIn?.supportedFirstFactors,
          signUpMissingFields: signUp?.missingFields,
        });

        if (Platform.OS !== "web") {
          toast.error("Sign In Incomplete", {
            description: "Google sign-in could not complete. Please try again.",
          });
        }
      } catch (err: any) {
        // See https://go.clerk.com/mRUDrIe for more info on error handling
        console.error("❌ OAuth Error:", err);
        console.error("❌ Full error details:", JSON.stringify(err, null, 2));

        // Show error to user in development/production build
        if (Platform.OS !== "web") {
          const errorMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "An unknown error occurred";
          toast.error("Login Failed", { description: errorMessage });
        }
      }
    };
  }

  return (
    <View className="w-full gap-2">
      {SOCIAL_CONNECTION_STRATEGIES.map((strategy) => {
        return (
          <Button key={strategy.type} size="lg" className="w-full flex-row gap-3 rounded-2xl" onPress={onSocialLoginPress(strategy.type)}>
            <Image className="size-6" tintColor="white" source={strategy.source} />
            <Text className="text-primary-foreground text-lg font-semibold">Continue with Google</Text>
          </Button>
        );
      })}
    </View>
  );
}

const useWarmUpBrowser = Platform.select({
  web: () => {},
  default: () => {
    React.useEffect(() => {
      // Preloads the browser for Android devices to reduce authentication load time
      // See: https://docs.expo.dev/guides/authentication/#improving-user-experience
      void WebBrowser.warmUpAsync();
      return () => {
        // Cleanup: closes browser when component unmounts
        void WebBrowser.coolDownAsync();
      };
    }, []);
  },
});
