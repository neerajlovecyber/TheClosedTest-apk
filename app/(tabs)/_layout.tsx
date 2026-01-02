import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { FlaskConicalIcon, HomeIcon, SettingsIcon, StoreIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
    const insets = useSafeAreaInsets();
    return (
        <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
            <Tabs
                screenOptions={{
                    headerTitleAlign: 'left',
                    headerTitleStyle: { paddingLeft: 16 },
                    tabBarStyle: {
                        height: 60 + insets.bottom,
                        paddingBottom: insets.bottom + 4,
                        paddingTop: 8,
                    },
                    tabBarLabelStyle: {
                        fontSize: 11,
                        fontWeight: '500',
                    },
                    headerShown: false,
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ color }) => <Icon as={HomeIcon} color={color} className="size-6" />,
                    }}
                />
                <Tabs.Screen
                    name="marketplace"
                    options={{
                        title: 'Marketplace',
                        tabBarIcon: ({ color }) => <Icon as={StoreIcon} color={color} className="size-6" />,
                        headerShown: false,
                    }}
                />
                <Tabs.Screen
                    name="tests"
                    options={{
                        title: 'Tests',
                        tabBarIcon: ({ color }) => <Icon as={FlaskConicalIcon} color={color} className="size-6" />,
                    }}
                />
                <Tabs.Screen
                    name="settings"
                    options={{
                        title: 'Settings',
                        tabBarIcon: ({ color }) => <Icon as={SettingsIcon} color={color} className="size-6" />,
                    }}
                />
            </Tabs>
        </View>
    );
}
