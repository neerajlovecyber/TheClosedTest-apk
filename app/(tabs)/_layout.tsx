import { Tabs } from 'expo-router';
import { HomeIcon, SettingsIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                headerTitleAlign: 'left',
                headerTitleStyle: { paddingLeft: 16 },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color }) => <Icon as={HomeIcon} color={color} />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    title: 'Settings',
                    tabBarIcon: ({ color }) => <Icon as={SettingsIcon} color={color} />,
                }}
            />
        </Tabs>
    );
}
