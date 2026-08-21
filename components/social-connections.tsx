
import { toast } from '@/lib/sonner';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSSO, type StartSSOFlowParams } from '@clerk/clerk-expo';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Image, Platform, View, type ImageSourcePropType } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

type SocialConnectionStrategy = Extract<
  StartSSOFlowParams['strategy'],
  'oauth_google' | 'oauth_github' | 'oauth_apple'
>;

const SOCIAL_CONNECTION_STRATEGIES: {
  type: SocialConnectionStrategy;
  source: ImageSourcePropType;
  useTint?: boolean;
}[] = [
    {
      type: 'oauth_google',
      source: { uri: 'https://img.clerk.com/static/google.png?width=160' },
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
        // Start the authentication process by calling `startSSOFlow()`
        const { createdSessionId, setActive, signIn, signUp } = await startSSOFlow({
          strategy,
        });

        console.log("🔵 OAuth flow returned:", {
          hasCreatedSessionId: !!createdSessionId,
          hasSetActive: !!setActive,
          signInStatus: signIn?.status,
          signUpStatus: signUp?.status,
        });

        // If sign in was successful, set the active session
        if (createdSessionId && setActive) {
          console.log("✅ OAuth Success: Session created directly");
          await setActive({ session: createdSessionId });
          return;
        }

        // If no createdSessionId, check if signIn or signUp is complete
        if (signIn && signIn.status === 'complete' && signIn.createdSessionId && setActive) {
          console.log("✅ OAuth Success: SignIn completed");
          await setActive({ session: signIn.createdSessionId });
          return;
        }
        if (signUp && signUp.status === 'complete' && signUp.createdSessionId && setActive) {
          console.log("✅ OAuth Success: SignUp completed");
          await setActive({ session: signUp.createdSessionId });
          return;
        }

        // Handle 'needs_identifier' status - this is a Clerk configuration issue
        if (signIn && signIn.status === 'needs_identifier') {
          console.log("🔵 Handling needs_identifier status...");
          console.log("🔵 Available factors:", JSON.stringify(signIn.supportedFirstFactors, null, 2));

          // This status means Clerk can't automatically complete the OAuth flow
          // This is almost always a configuration issue in the Clerk Dashboard
          console.error("⚠️ CLERK CONFIGURATION ISSUE:");
          console.error("⚠️ Google OAuth returned 'needs_identifier' status");
          console.error("⚠️ Fix this in Clerk Dashboard:");
          console.error("⚠️ 1. Go to User & Authentication → Social Connections → Google");
          console.error("⚠️ 2. Enable 'Automatically create users'");
          console.error("⚠️ 3. Go to User & Authentication → Email, Phone, Username");
          console.error("⚠️ 4. Set Email to 'Required' (not 'Off')");
          console.error("⚠️ 5. Set Username to 'Optional' (not 'Required')");

          if (Platform.OS !== 'web') {
            toast.error("Configuration Issue", {
              description: "Google sign-in requires additional setup in Clerk Dashboard. Please check the console for details."
            });
          }
          return;
        }

        // Log detailed status for debugging
        console.log("SSO Flow incomplete:", {
          signInStatus: signIn?.status,
          signUpStatus: signUp?.status,
          signInFirstFactors: signIn?.supportedFirstFactors,
          signUpMissingFields: signUp?.missingFields,
        });

        // If we get here, the OAuth flow didn't complete automatically
        // This can happen if:
        // 1. Clerk requires additional user information
        // 2. The account needs verification
        // 3. There's a configuration mismatch
        if (Platform.OS !== 'web') {
          toast.error("Sign In Issue", {
            description: "Google sign-in couldn't complete automatically. Please check your Clerk dashboard settings or try again."
          });
        }
      } catch (err: any) {
        // See https://go.clerk.com/mRUDrIe for more info on error handling
        console.error("❌ OAuth Error:", err);
        console.error("❌ Full error details:", JSON.stringify(err, null, 2));

        // Show error to user in development/production build
        if (Platform.OS !== 'web') {
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
          <Button
            key={strategy.type}
            size="lg"
            className="w-full flex-row gap-3 rounded-2xl"
            onPress={onSocialLoginPress(strategy.type)}>
            <Image
              className="size-6"
              tintColor="white"
              source={strategy.source}
            />
            <Text className="text-primary-foreground text-lg font-semibold">Continue with Google</Text>
          </Button>
        );
      })}
    </View>
  );
}

const useWarmUpBrowser = Platform.select({
  web: () => { },
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
