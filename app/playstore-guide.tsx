import React from 'react';
import { View, ScrollView, useWindowDimensions, Image } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stack } from 'expo-router';

export default function PlayStoreGuideScreen() {
    const { width } = useWindowDimensions();

    return (
        <>
            <Stack.Screen options={{ title: 'Add Google Group', headerShown: true }} />
            <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Hero */}
                <View className="items-center mb-6 pt-2">
                    <Text className="text-2xl font-black text-center">🔗 Add Google Group to Play Store</Text>
                    <Text className="text-muted-foreground text-center mt-1">Follow these steps to link our tester community</Text>
                </View>

                <Card>
                    <CardContent className="pt-4">
                        {/* Step 1 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">1</Text>
                                </View>
                                <Text className="font-bold text-foreground">Open Play Console Sidebar</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Go to your app in the Google Play Console and click on the sidebar menu.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/sidebar.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 2 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">2</Text>
                                </View>
                                <Text className="font-bold text-foreground">Select Closed Testing</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Navigate to "Testing" → "Closed testing" in the sidebar menu.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/closedtestingselectsidebar.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 3 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">3</Text>
                                </View>
                                <Text className="font-bold text-foreground">Manage Track</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Click on "Manage track" for your closed testing track.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/managetrack.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 4 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">4</Text>
                                </View>
                                <Text className="font-bold text-foreground">Click on Testers</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                In the track settings, click on "Testers" tab to manage your tester list.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/clickontesters.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 5 */}
                        <View className="mb-4">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">5</Text>
                                </View>
                                <Text className="font-bold text-foreground">Add the Google Group</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Add the Google Group email: <Text className="font-bold">developers-community-official@googlegroups.com</Text>
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/addthegooglegrp.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 6 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">6</Text>
                                </View>
                                <Text className="font-bold text-foreground">Click Save</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                After adding the Google Group, click "Save" to apply your changes.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/clicksave .png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 7 */}
                        <View className="mb-6">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">7</Text>
                                </View>
                                <Text className="font-bold text-foreground">Go to Publishing Overview</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Navigate to "Publishing overview" in the sidebar to publish your changes.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/gotopublishingoverview.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Step 8 */}
                        <View className="mb-4">
                            <View className="flex-row items-center gap-2 mb-2">
                                <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                                    <Text className="text-white font-bold text-sm">8</Text>
                                </View>
                                <Text className="font-bold text-foreground">Send for Review</Text>
                            </View>
                            <Text className="text-sm text-muted-foreground mb-3">
                                Click "Send for review" to submit your tester list changes to Google.
                            </Text>
                            <Image
                                source={require('@/assets/images/guide/sendforreview.png')}
                                style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 12 }}
                                resizeMode="contain"
                            />
                        </View>

                        <View className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl mt-2">
                            <Text className="text-sm text-green-700 dark:text-green-300 font-medium text-center">
                                ✅ Once added, testers from our community can opt-in to test your app!
                            </Text>
                        </View>

                        <View className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mt-3">
                            <Text className="text-sm text-amber-700 dark:text-amber-300 font-medium text-center">
                                ⏱️ Wait 10-15 minutes for changes to be published by Google Play Console
                            </Text>
                        </View>
                    </CardContent>
                </Card>
            </ScrollView>
        </>
    );
}
