import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { OnboardingMockup } from '@/components/onboarding-mockup';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { router } from 'expo-router';
import * as React from 'react';
import { Animated, Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box, Handshake, Camera, Sparkles, Star, HelpCircleIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Icon } from '@/components/ui/icon';
import { TouchableOpacity } from 'react-native';

const ONBOARDING_STEPS = [
    {
        title: 'Need 12 Testers?',
        description: 'Get 12 testers for your Android app to pass Google Play\'s closed testing requirement.',
        mockupType: 'welcome' as const,
        iconBgClass: 'bg-primary/10 dark:bg-primary/20',
    },
    {
        title: 'Step 1: Add Your App',
        description: 'Submit your app details and Play Store link so others can find and test it.',
        mockupType: 'add-app' as const,
        iconBgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
    },
    {
        title: 'Step 2: Find Testers',
        description: 'Browse the marketplace and request swaps with other developers.',
        mockupType: 'marketplace' as const,
        iconBgClass: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    },
    {
        title: 'Step 3: Test Daily',
        description: 'Test your partner\'s app for 14 days. Upload screenshot proof daily.',
        mockupType: 'testing' as const,
        iconBgClass: 'bg-orange-500/10 dark:bg-orange-500/20',
    },
    {
        title: 'Get Published!',
        description: 'Pass the 14-day closed test requirement and launch your app to millions on Google Play.',
        mockupType: 'success' as const,
        iconBgClass: 'bg-muted/10 dark:bg-muted/20',
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
            {/* Help Button */}
            <TouchableOpacity
                onPress={() => router.push('/(auth)/guide')}
                style={{ position: 'absolute', top: 60, right: 16, zIndex: 10 }}
                className="w-10 h-10 rounded-full bg-muted/50 items-center justify-center"
                activeOpacity={0.7}
            >
                <Icon as={HelpCircleIcon} className="text-muted-foreground size-5" />
            </TouchableOpacity>
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
                        <View className="items-center justify-center gap-8 w-full">
                            {/* Mockup Container with premium styling */}
                            <Animated.View
                                style={{ transform: [{ scale: index === activeIndex ? scaleAnim : 1 }] }}
                                className={cn(
                                    "w-full aspect-square max-w-[320px] rounded-[48px] items-center justify-center overflow-hidden",
                                    step.iconBgClass
                                )}
                            >
                                <Pressable
                                    className="w-full h-full items-center justify-center"
                                    onLongPress={index === 0 ? () => router.push('/(auth)/tester-login') : undefined}
                                    delayLongPress={2000}
                                >
                                    <OnboardingMockup type={step.mockupType} />
                                </Pressable>
                            </Animated.View>

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
