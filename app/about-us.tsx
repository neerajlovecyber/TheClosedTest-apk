import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon, GlobeIcon, MailIcon, TwitterIcon } from 'lucide-react-native';
import * as React from 'react';
import { Image, Linking, ScrollView, View } from 'react-native';

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
            <ScrollView className="flex-1 bg-background">
                <View className="flex-1 items-center px-6 py-12 gap-8 max-w-md mx-auto w-full">
                    {/* Header Section */}
                    <View className="items-center gap-4">
                        <View className="size-24 rounded-2xl bg-primary/10 items-center justify-center shadow-sm">
                            <Text className="text-4xl">🚀</Text>
                            {/* Replace with actual App Logo Image if available
                 <Image source={require('@/assets/images/icon.png')} className="size-24 rounded-2xl" /> 
                 */}
                        </View>
                        <View className="items-center gap-1">
                            <Text className="text-2xl font-bold tracking-tight">The Closed Test</Text>
                            <Text className="text-muted-foreground font-medium">Version 1.0.0</Text>
                        </View>
                    </View>

                    {/* Mission/Description */}
                    <View className="gap-4">
                        <Text className="text-center text-foreground/80 leading-7">
                            We are dedicated to helping developers test their apps efficiently.
                            The Closed Test facilitates seamless connection between testers and developers,
                            ensuring your app is ready for the world.
                        </Text>
                        <Text className="text-center text-foreground/80 leading-7">
                            Our mission is to democratize app testing and provide a robust platform for
                            feedback and improvement before your big launch.
                        </Text>
                    </View>

                    {/* Contact Us Card */}
                    <Card className="w-full">
                        <CardHeader className="items-center pb-2">
                            <CardTitle>Contact Us</CardTitle>
                            <CardDescription className="text-center">
                                Have questions? Reach out to us directly.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="items-center pb-6">
                            <Button
                                className="flex-row gap-2 w-full"
                                onPress={() => handleLink('mailto:Theneerajsec@gmail.com')}
                            >
                                <Icon as={MailIcon} className="size-4 text-primary-foreground" />
                                <Text className="text-primary-foreground font-medium">Theneerajsec@gmail.com</Text>
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Footer */}
                    <View className="mt-8 pt-8 border-t border-border w-full items-center">
                        <Text className="text-sm text-muted-foreground">
                            © Theneerajsec 2025
                        </Text>
                        <Text className="text-sm text-muted-foreground">
                            All rights reserved.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </>
    );
}
