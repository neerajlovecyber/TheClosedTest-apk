import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useSignIn } from "@clerk/clerk-expo";
import { router } from "expo-router";
import * as React from "react";
import { type TextInput, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export default function TesterLoginScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded || isLoading) {
      return;
    }

    setIsLoading(true);
    setError({});

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        return;
      }
      console.error("Sign in incomplete:", JSON.stringify(signInAttempt, null, 2));
      setError({ password: "Sign in could not be completed" });
    } catch (err) {
      if (err instanceof Error) {
        const isEmailMessage = err.message.toLowerCase().includes("identifier") || err.message.toLowerCase().includes("email");
        setError(isEmailMessage ? { email: err.message } : { password: err.message });
      } else {
        setError({ password: "An unexpected error occurred" });
      }
      console.error("Sign in error:", JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
    }
  }

  function onEmailSubmitEditing() {
    passwordInputRef.current?.focus();
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }} bottomOffset={50}>
        <Card className="mx-auto w-full max-w-sm border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">🔐 Tester Login</CardTitle>
            <CardDescription className="text-center">Internal access for Play Store testers</CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="gap-4">
              <View className="gap-1.5">
                <Label htmlFor="tester-email">Email</Label>
                <Input
                  id="tester-email"
                  placeholder="tester@example.com"
                  keyboardType="email-address"
                  autoComplete="email"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={onEmailSubmitEditing}
                  returnKeyType="next"
                  submitBehavior="submit"
                  editable={!isLoading}
                />
                {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
              </View>
              <View className="gap-1.5">
                <Label htmlFor="tester-password">Password</Label>
                <Input
                  ref={passwordInputRef}
                  id="tester-password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="send"
                  onSubmitEditing={onSubmit}
                  editable={!isLoading}
                />
                {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
              </View>
              <Button className="w-full" onPress={onSubmit} disabled={isLoading || !email || !password}>
                {isLoading ? <ActivityIndicator size="small" color="white" /> : <Text>Sign In</Text>}
              </Button>
              <Button variant="ghost" className="w-full" onPress={() => router.back()} disabled={isLoading}>
                <Text>Back to Welcome</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
