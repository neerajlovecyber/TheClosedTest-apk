import { toast } from "@/lib/sonner";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useOAuth } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as React from "react";
import { Image, Platform, View } from "react-native";

export function SocialConnections() {
  useWarmUpBrowser();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const onGoogleLoginPress = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      console.log("🔵 Starting Google OAuth flow via useOAuth...");
      const { createdSessionId, setActive, signIn, signUp } = await startOAuthFlow();
      console.log("🔵 OAuth result:", {
        createdSessionId,
        signInStatus: signIn?.status,
        signUpStatus: signUp?.status,
      });

      if (createdSessionId && setActive) {
        console.log("✅ OAuth Success: Session created", createdSessionId);
        await setActive({ session: createdSessionId });
        return;
      }

      if (Platform.OS !== "web") {
        toast.error("Sign In Incomplete", {
          description: "Google sign-in could not complete. Please try again.",
        });
      }
    } catch (err: any) {
      console.error("❌ OAuth Error:", err);
      if (Platform.OS !== "web") {
        const errorMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "An unknown error occurred";
        toast.error("Login Failed", { description: errorMessage });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="w-full gap-2">
      <Button
        size="lg"
        className="w-full flex-row gap-3 rounded-2xl"
        onPress={onGoogleLoginPress}
        disabled={isSubmitting}
      >
        <Image
          className="size-6"
          tintColor="white"
          source={{ uri: "https://img.clerk.com/static/google.png?width=160" }}
        />
        <Text className="text-primary-foreground text-lg font-semibold">
          {isSubmitting ? "Signing in..." : "Continue with Google"}
        </Text>
      </Button>
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
