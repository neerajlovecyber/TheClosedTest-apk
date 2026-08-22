import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Stack, useRouter } from "expo-router";
import { ChevronLeftIcon, ShieldIcon, DatabaseIcon, LockIcon, MailIcon, FileTextIcon, LucideIcon } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View, Linking } from "react-native";

interface SectionProps {
  icon: LucideIcon;
  title: string;
  iconColor: string;
  children: React.ReactNode;
}

function Section({ icon, title, iconColor, children }: SectionProps) {
  return (
    <Card className="border-0">
      <CardContent className="p-5 gap-4">
        <View className="flex-row items-center gap-3">
          <View className={`h-10 w-10 rounded-xl items-center justify-center ${iconColor}`}>
            <Icon as={icon} className="size-5 text-white" />
          </View>
          <Text className="text-lg font-bold text-foreground">{title}</Text>
        </View>
        <View className="gap-2">{children}</View>
      </CardContent>
    </Card>
  );
}

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Privacy Policy",
          headerLeft: () => (
            <Button variant="ghost" size="icon" onPress={() => router.back()} className="mr-2">
              <Icon as={ChevronLeftIcon} className="size-6" />
            </Button>
          ),
        }}
      />
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-1 px-4 py-6 gap-4">
          {/* Header */}
          <View className="px-2 mb-2">
            <Text className="text-3xl font-black text-foreground tracking-tight">Privacy Policy</Text>
            <Text className="text-muted-foreground font-medium mt-1">Last updated: December 27, 2025</Text>
          </View>

          <Section icon={FileTextIcon} title="Introduction" iconColor="bg-blue-500">
            <Text className="text-foreground/80 leading-7">
              Welcome to The Closed Test. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to
              how we look after your personal data when you visit our application and tell you about your privacy rights and how the law protects you.
            </Text>
          </Section>

          <Section icon={DatabaseIcon} title="Data We Collect" iconColor="bg-violet-500">
            <Text className="text-foreground/80 leading-7">We may collect, use, store and transfer different kinds of personal data about you:</Text>
            <View className="gap-2 bg-muted/30 rounded-xl p-4">
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Identity Data</Text> - first name, last name, username or similar identifier.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Contact Data</Text> - email address.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Technical Data</Text> - IP address, login data, browser type, time zone, OS and platform.
              </Text>
            </View>
          </Section>

          <Section icon={ShieldIcon} title="How We Use Your Data" iconColor="bg-green-500">
            <Text className="text-foreground/80 leading-7">
              We will only use your personal data when the law allows us to. Most commonly, we will use your personal data:
            </Text>
            <View className="gap-2 bg-muted/30 rounded-xl p-4">
              <Text className="text-foreground/80 leading-6">
                • Where we need to perform the contract we are about to enter into or have entered into with you.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • Where it is necessary for our legitimate interests and your rights do not override those interests.
              </Text>
            </View>
          </Section>

          <Section icon={LockIcon} title="Data Security" iconColor="bg-amber-500">
            <Text className="text-foreground/80 leading-7">
              We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized
              way, altered or disclosed.
            </Text>
          </Section>

          <Section icon={MailIcon} title="Contact Us" iconColor="bg-cyan-500">
            <Text className="text-foreground/80 leading-7">
              If you have any questions about this privacy policy or our privacy practices, please contact us:
            </Text>
            <Button size="lg" className="rounded-2xl flex-row gap-2 mt-2" onPress={() => Linking.openURL("mailto:Theneerajsec@gmail.com")}>
              <Icon as={MailIcon} className="size-5 text-white" />
              <Text className="text-white font-semibold">Theneerajsec@gmail.com</Text>
            </Button>
          </Section>

          {/* Footer */}
          <View className="mt-4 pt-6 border-t border-border items-center">
            <Text className="text-sm text-muted-foreground/60">© Theneerajsec 2025 • All rights reserved</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
