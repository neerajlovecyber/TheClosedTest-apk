import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon, BoxIcon, RocketIcon, UsersIcon, MailIcon, HeartIcon, Code2Icon, LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import Constants from 'expo-constants';
import appConfig from '../app.json';

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
                <View className="gap-2">
                    {children}
                </View>
            </CardContent>
        </Card>
    );
}

export default function AboutUsScreen() {
    const router = useRouter();

    const handleLink = (url: string) => {
        Linking.openURL(url).catch((err) => console.error("Couldn't load page", err));
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: 'About Us',
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
                    <View className="items-center gap-4 py-6">
                        <View className="size-24 rounded-3xl bg-primary/10 items-center justify-center">
                            <Icon as={BoxIcon} className="size-12 text-primary" />
                        </View>
                        <View className="items-center gap-1">
                            <Text className="text-3xl font-black tracking-tight text-foreground">The Closed Test</Text>
                            <Text className="text-muted-foreground font-medium">Version {appConfig.expo?.version || Constants.expoConfig?.version || '3.0.0'}</Text>
                        </View>
                    </View>

                    <Section icon={RocketIcon} title="Our Mission" iconColor="bg-blue-500">
                        <Text className="text-foreground/80 leading-7">
                            We are dedicated to helping developers test their apps efficiently. The Closed Test facilitates seamless connection between testers and developers, ensuring your app is ready for the world.
                        </Text>
                    </Section>

                    <Section icon={UsersIcon} title="What We Do" iconColor="bg-green-500">
                        <Text className="text-foreground/80 leading-7">
                            Our mission is to democratize app testing and provide a robust platform for feedback and improvement before your big launch.
                        </Text>
                        <View className="gap-2 bg-muted/30 rounded-xl p-4 mt-2">
                            <Text className="text-foreground/80 leading-6">• <Text className="font-semibold">Mutual Testing</Text> - Connect with other developers for app testing exchanges.</Text>
                            <Text className="text-foreground/80 leading-6">• <Text className="font-semibold">Daily Proofs</Text> - Verify testing with screenshot uploads.</Text>
                            <Text className="text-foreground/80 leading-6">• <Text className="font-semibold">Reputation System</Text> - Build trust within the community.</Text>
                        </View>
                    </Section>

                    <Section icon={HeartIcon} title="Why Choose Us" iconColor="bg-violet-500">
                        <Text className="text-foreground/80 leading-7">
                            We understand the challenges developers face when trying to meet Google Play's closed testing requirements. That's why we built a community-driven solution that makes it easy to find reliable testers.
                        </Text>
                    </Section>

                    <Section icon={Code2Icon} title="Open Source Project" iconColor="bg-zinc-800">
                        <Text className="text-foreground/80 leading-7">
                            The Closed Test is 100% open source. Check out our GitHub repository to explore the codebase, report issues, or contribute to new features.
                        </Text>
                        <Button
                            size="lg"
                            variant="outline"
                            className="rounded-2xl flex-row gap-2 mt-2"
                            onPress={() => handleLink('https://github.com/neerajlovecyber/TheClosedTest-apk')}
                        >
                            <Icon as={Code2Icon} className="size-5 text-foreground" />
                            <Text className="text-foreground font-semibold">View on GitHub</Text>
                        </Button>
                    </Section>

                    <Section icon={MailIcon} title="Contact Us" iconColor="bg-cyan-500">
                        <Text className="text-foreground/80 leading-7">
                            Have questions or feedback? We'd love to hear from you!
                        </Text>
                        <Button
                            size="lg"
                            className="rounded-2xl flex-row gap-2 mt-2"
                            onPress={() => handleLink('mailto:Theneerajsec@gmail.com')}
                        >
                            <Icon as={MailIcon} className="size-5 text-white" />
                            <Text className="text-white font-semibold">Theneerajsec@gmail.com</Text>
                        </Button>
                    </Section>

                    {/* Footer */}
                    <View className="mt-4 pt-6 border-t border-border items-center gap-1">
                        <Text className="text-sm text-muted-foreground/60">
                            © Theneerajsec 2025
                        </Text>
                        <Text className="text-sm text-muted-foreground/60">
                            All rights reserved
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </>
    );
}
