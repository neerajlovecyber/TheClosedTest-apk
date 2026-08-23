import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Stack, useRouter } from "expo-router";
import {
  ChevronLeftIcon,
  ShieldCheckIcon,
  DatabaseIcon,
  LockIcon,
  MailIcon,
  FileTextIcon,
  UsersIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  ScaleIcon,
  LucideIcon,
} from "lucide-react-native";
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

export default function LegalScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Terms & Privacy Policy",
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
            <Text className="text-3xl font-black text-foreground tracking-tight">Terms & Privacy Policy</Text>
            <Text className="text-muted-foreground font-medium mt-1">Last updated: January 2026</Text>
          </View>

          {/* ================= TERMS OF SERVICE ================= */}
          <View className="px-2 pt-2">
            <Text className="text-xs font-bold text-primary uppercase tracking-widest">Part 1 • Terms of Service</Text>
          </View>

          <Section icon={FileTextIcon} title="1. Acceptance of Terms" iconColor="bg-blue-500">
            <Text className="text-foreground/80 leading-7">
              By accessing or using The Closed Test ("the Platform"), you agree to comply with and be bound by these Terms. If you disagree with any part of
              these terms, please discontinue using the platform.
            </Text>
          </Section>

          <Section icon={CheckCircle2Icon} title="2. Reciprocal Testing Rules" iconColor="bg-emerald-500">
            <Text className="text-foreground/80 leading-7">The Closed Test is built on trust and genuine peer-to-peer developer collaboration:</Text>
            <View className="gap-2 bg-muted/30 rounded-xl p-4">
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">14-Day Commitment</Text> - Testers must install matched apps and perform actual daily testing activities for
                the full 14-day test cycle.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Authentic Proofs Only</Text> - All daily screenshots uploaded for verification must be genuine in-app proofs.
                Submitting fake, blank, or fraudulent screenshots results in an immediate permanent ban.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Reciprocal Testing</Text> - In exchange for testers reviewing your app, you agree to diligently test your
                matched partner's app each day.
              </Text>
            </View>
          </Section>

          <Section icon={UsersIcon} title="3. Community & Google Group Guidelines" iconColor="bg-violet-500">
            <Text className="text-foreground/80 leading-7">
              Access to our closed testing Google Group requires professional conduct. Harassment, spam, malicious code, or deceptive applications are strictly
              prohibited.
            </Text>
          </Section>

          <Section icon={AlertTriangleIcon} title="4. Account Suspension & Fair Play" iconColor="bg-amber-500">
            <Text className="text-foreground/80 leading-7">
              We reserve the right to suspend or terminate accounts and remove apps that violate our fair play standards, miss daily testing obligations, or
              attempt to exploit the platform.
            </Text>
          </Section>

          {/* ================= PRIVACY POLICY ================= */}
          <View className="px-2 pt-6">
            <Text className="text-xs font-bold text-teal-500 uppercase tracking-widest">Part 2 • Privacy Policy</Text>
          </View>

          <Section icon={DatabaseIcon} title="5. Data We Collect" iconColor="bg-teal-500">
            <Text className="text-foreground/80 leading-7">We collect and process essential data necessary to operate the reciprocal testing service:</Text>
            <View className="gap-2 bg-muted/30 rounded-xl p-4">
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Account Data</Text> - Name, email address, and profile picture.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">App Data</Text> - App package names, test links, instructions, and review history.
              </Text>
              <Text className="text-foreground/80 leading-6">
                • <Text className="font-semibold">Verification Proofs</Text> - Daily screenshots uploaded by testers to verify test completion.
              </Text>
            </View>
          </Section>

          <Section icon={ShieldCheckIcon} title="6. How We Use Your Data" iconColor="bg-green-500">
            <Text className="text-foreground/80 leading-7">Your personal information is used exclusively for platform operations:</Text>
            <View className="gap-2 bg-muted/30 rounded-xl p-4">
              <Text className="text-foreground/80 leading-6">• Matching your apps with suitable developer testing partners.</Text>
              <Text className="text-foreground/80 leading-6">• Sending daily testing task notifications and match alerts.</Text>
              <Text className="text-foreground/80 leading-6">• Preventing fraud and maintaining community reputation scores.</Text>
            </View>
          </Section>

          <Section icon={LockIcon} title="7. Data Security" iconColor="bg-amber-600">
            <Text className="text-foreground/80 leading-7">
              We implement industry-standard encryption, secure cloud infrastructure, and access controls to safeguard your personal data from unauthorized
              access or disclosure.
            </Text>
          </Section>

          {/* ================= LEGAL DISCLAIMER & CONTACT ================= */}
          <View className="px-2 pt-6">
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">Part 3 • General & Disclaimer</Text>
          </View>

          <Section icon={ScaleIcon} title="8. Google Play Disclaimer" iconColor="bg-slate-600">
            <Text className="text-foreground/80 leading-7">
              The Closed Test is an independent developer collaboration platform and is not affiliated with, sponsored by, or endorsed by Google LLC. Production
              access approval remains exclusively at the discretion of Google Play.
            </Text>
          </Section>

          <Section icon={MailIcon} title="9. Contact Support" iconColor="bg-cyan-500">
            <Text className="text-foreground/80 leading-7">
              If you have any questions about these Terms of Service or Privacy Policy, please contact our team:
            </Text>
            <Button size="lg" className="rounded-2xl flex-row gap-2 mt-2" onPress={() => Linking.openURL("mailto:Theneerajsec@gmail.com")}>
              <Icon as={MailIcon} className="size-5 text-white" />
              <Text className="text-white font-semibold">Theneerajsec@gmail.com</Text>
            </Button>
          </Section>

          {/* Footer */}
          <View className="mt-4 pt-6 border-t border-border items-center">
            <Text className="text-sm text-muted-foreground/60">© Theneerajsec 2026 • All rights reserved</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
