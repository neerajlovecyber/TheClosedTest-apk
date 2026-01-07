import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { router } from 'expo-router';
import * as React from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ONBOARDING_STEPS = [
    {
        title: 'Welcome to The Closed Test',
        description: 'The easiest way for Android developers to get 12 testers for the Google Play closed testing requirement.',
        icon: '🚀',
    },
    {
        title: 'Mutual Testing',
        description: 'I test your app, you test mine. Simple 1-to-1 exchange to help each other pass the 14-day requirement.',
        icon: '🤝',
    },
    {
        title: 'Daily Proof System',
        description: 'Upload screenshots daily to verify testing. Build reputation and trust with other developers.',
        icon: '📸',
    },
    {
        title: 'Get Started',
        description: 'Join our community of Android developers helping each other succeed.',
        icon: '✨',
    },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function WelcomeScreen() {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const scrollViewRef = React.useRef<ScrollView>(null);

    const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = event.nativeEvent.contentOffset.x / slideSize;
        const roundIndex = Math.round(index);

        const distance = Math.abs(roundIndex - index);
        // Only update if we are close to the snap point
        const isNoomansLand = distance > 0.4;

        if (roundIndex !== activeIndex && !isNoomansLand) {
            setActiveIndex(roundIndex);
        }
    }, [activeIndex]);

    const handleNext = React.useCallback(() => {
        if (activeIndex < ONBOARDING_STEPS.length - 1) {
            scrollViewRef.current?.scrollTo({ x: (activeIndex + 1) * SCREEN_WIDTH, animated: true });
        }
    }, [activeIndex]);

    return (
        <SafeAreaView className="flex-1 bg-background">
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1 }}
            >
                {ONBOARDING_STEPS.map((step, index) => (
                    <View key={index} style={{ width: SCREEN_WIDTH }} className="flex-1 items-center justify-center p-8 gap-8">
                        <View className="items-center justify-center gap-6">
                            {/* First slide icon has secret long-press trigger */}
                            {index === 0 ? (
                                <Pressable
                                    onLongPress={() => router.push('/(auth)/tester-login')}
                                    delayLongPress={2000}
                                    className="size-32 rounded-3xl bg-primary/10 items-center justify-center"
                                >
                                    <Text className="text-6xl">{step.icon}</Text>
                                </Pressable>
                            ) : (
                                <View className="size-32 rounded-3xl bg-primary/10 items-center justify-center">
                                    <Text className="text-6xl">{step.icon}</Text>
                                </View>
                            )}
                            <View className="gap-2 items-center">
                                <Text className="text-2xl font-bold text-center tracking-tight">{step.title}</Text>
                                <Text className="text-muted-foreground text-center text-lg leading-6 px-4">
                                    {step.description}
                                </Text>
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Pagination Indicators and Next Button logic if needed (hidden on last slide if using social login there) */}
            <View className="p-8 gap-8">
                <View className="flex-row justify-center gap-2">
                    {ONBOARDING_STEPS.map((_, i) => (
                        <View
                            key={i}
                            className={cn(
                                "h-2 rounded-full transition-all",
                                i === activeIndex ? "w-8 bg-primary" : "w-2 bg-primary/20"
                            )}
                        />
                    ))}
                </View>

                {activeIndex < ONBOARDING_STEPS.length - 1 ? (
                    <Button onPress={handleNext} size="lg" className="w-full">
                        <Text>Next</Text>
                    </Button>
                ) : (
                    <View className="w-full gap-4">
                        <SocialConnections />
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}
