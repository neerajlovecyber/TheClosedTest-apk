import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { router } from 'expo-router';
import * as React from 'react';
import { Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box, Handshake, Camera, Sparkles, Star } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

const ONBOARDING_STEPS = [
    {
        title: 'Welcome to\nThe Closed Test',
        description: 'Get 12+ testers for your Android app to pass Google Play\'s closed testing requirement.',
        Icon: Box,
        iconBgClass: 'bg-primary/10 dark:bg-primary/20',
        iconColor: '#3B82F6', // blue-500
    },
    {
        title: 'Mutual Testing\nExchange',
        description: 'I test your app for 14 days, you test mine. Simple swap system to help each other succeed.',
        Icon: Handshake,
        iconBgClass: 'bg-green-500/10 dark:bg-green-500/20',
        iconColor: '#22C55E', // green-500
    },
    {
        title: 'Daily Screenshot\nProof',
        description: 'Upload 1 screenshot daily showing you used the app. Your partner reviews and approves it.',
        Icon: Camera,
        iconBgClass: 'bg-amber-500/10 dark:bg-amber-500/20',
        iconColor: '#F59E0B', // amber-500
    },
    {
        title: 'Build Your\nReputation',
        description: 'Earn +1 for approved proofs. Lose points for missed days (-2) or rejections (-5). Higher score = more trust!',
        Icon: Star,
        iconBgClass: 'bg-purple-500/10 dark:bg-purple-500/20',
        iconColor: '#A855F7', // purple-500
    },
    {
        title: 'Ready to\nGet Started?',
        description: 'Join our community of Android developers helping each other publish on Google Play.',
        Icon: Sparkles,
        iconBgClass: 'bg-cyan-500/10 dark:bg-cyan-500/20',
        iconColor: '#06B6D4', // cyan-500
    },
];

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function WelcomeScreen() {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    // Bounce animation when slide changes
    React.useEffect(() => {
        Animated.sequence([
            Animated.spring(scaleAnim, {
                toValue: 0.9,
                useNativeDriver: true,
                speed: 50,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                speed: 20,
                bounciness: 12,
            }),
        ]).start();
    }, [activeIndex]);

    const handleScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = event.nativeEvent.contentOffset.x / slideSize;
        const roundIndex = Math.round(index);

        const distance = Math.abs(roundIndex - index);
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
                    <View
                        key={index}
                        style={{ width: SCREEN_WIDTH }}
                        className="flex-1 items-center justify-center p-8"
                    >
                        <View className="items-center justify-center gap-8">
                            {/* Icon Container with premium styling */}
                            {index === 0 ? (
                                <Pressable
                                    onLongPress={() => router.push('/(auth)/tester-login')}
                                    delayLongPress={2000}
                                >
                                    <Animated.View
                                        style={{ transform: [{ scale: index === activeIndex ? scaleAnim : 1 }] }}
                                        className={cn(
                                            "size-44 rounded-[44px] items-center justify-center",
                                            step.iconBgClass
                                        )}
                                    >
                                        <step.Icon size={72} color={step.iconColor} />
                                    </Animated.View>
                                </Pressable>
                            ) : (
                                <Animated.View
                                    style={{ transform: [{ scale: index === activeIndex ? scaleAnim : 1 }] }}
                                    className={cn(
                                        "size-44 rounded-[44px] items-center justify-center",
                                        step.iconBgClass
                                    )}
                                >
                                    <step.Icon size={72} color={step.iconColor} />
                                </Animated.View>
                            )}

                            {/* Text Content */}
                            <View className="gap-4 items-center mt-4">
                                <Text className="text-4xl font-black text-center text-foreground tracking-tight leading-tight">
                                    {step.title}
                                </Text>
                                <Text className="text-center text-lg leading-7 px-2 max-w-xs text-muted-foreground">
                                    {step.description}
                                </Text>
                            </View>
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Bottom Section */}
            <View className="mx-6 mb-6 p-6 rounded-3xl gap-6 bg-card">
                {/* Pagination Indicators */}
                <View className="flex-row justify-center gap-2">
                    {ONBOARDING_STEPS.map((_, i) => (
                        <View
                            key={i}
                            className={cn(
                                "h-2.5 rounded-full transition-all",
                                i === activeIndex
                                    ? "w-10 bg-primary"
                                    : "w-2.5 bg-muted-foreground/30"
                            )}
                        />
                    ))}
                </View>

                {activeIndex < ONBOARDING_STEPS.length - 1 ? (
                    <Button
                        onPress={handleNext}
                        size="lg"
                        className="w-full rounded-2xl"
                    >
                        <Text className="text-lg font-semibold text-primary-foreground">Continue</Text>
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
