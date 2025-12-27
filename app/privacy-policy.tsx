import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';

export default function PrivacyPolicyScreen() {
    const router = useRouter();

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: 'Privacy Policy',
                    headerLeft: () => (
                        <Button variant="ghost" size="icon" onPress={() => router.back()} className="mr-2">
                            <Icon as={ChevronLeftIcon} className="size-6" />
                        </Button>
                    ),
                }}
            />
            <ScrollView className="flex-1 bg-background">
                <View className="flex-1 px-6 py-8 gap-6 max-w-md mx-auto w-full">
                    <Text className="text-muted-foreground leading-7">
                        Last updated: December 27, 2025
                    </Text>

                    <View className="gap-2">
                        <Text className="text-xl font-bold">1. Introduction</Text>
                        <Text className="text-foreground/80 leading-7">
                            Welcome to The Closed Test. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our application and tell you about your privacy rights and how the law protects you.
                        </Text>
                    </View>

                    <View className="gap-2">
                        <Text className="text-xl font-bold">2. Data We Collect</Text>
                        <Text className="text-foreground/80 leading-7">
                            We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:
                        </Text>
                        <View className="gap-1 pl-4">
                            <Text className="text-foreground/80 leading-7">• Identity Data includes first name, last name, username or similar identifier.</Text>
                            <Text className="text-foreground/80 leading-7">• Contact Data includes email address.</Text>
                            <Text className="text-foreground/80 leading-7">• Technical Data includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, operating system and platform.</Text>
                        </View>
                    </View>

                    <View className="gap-2">
                        <Text className="text-xl font-bold">3. How We Use Your Data</Text>
                        <Text className="text-foreground/80 leading-7">
                            We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
                        </Text>
                        <View className="gap-1 pl-4">
                            <Text className="text-foreground/80 leading-7">• Where we need to perform the contract we are about to enter into or have entered into with you.</Text>
                            <Text className="text-foreground/80 leading-7">• Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</Text>
                        </View>
                    </View>

                    <View className="gap-2">
                        <Text className="text-xl font-bold">4. Data Security</Text>
                        <Text className="text-foreground/80 leading-7">
                            We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed.
                        </Text>
                    </View>

                    <View className="gap-2">
                        <Text className="text-xl font-bold">5. Contact Us</Text>
                        <Text className="text-foreground/80 leading-7">
                            If you have any questions about this privacy policy or our privacy practices, please contact us at: Theneerajsec@gmail.com.
                        </Text>
                    </View>

                    <View className="mt-8 pt-8 border-t border-border w-full items-center">
                        <Text className="text-sm text-muted-foreground">
                            © Theneerajsec 2025
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </>
    );
}
