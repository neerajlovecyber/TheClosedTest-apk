import { Text } from '@/components/ui/text';
import { View } from 'react-native';

export default function HomeScreen() {
    return (
        <View className="flex-1 items-center justify-center bg-background p-4">
            <Text className="text-2xl font-bold">Welcome Home</Text>
            <Text className="text-muted-foreground mt-2 text-center">
                This is your main dashboard. Content will appear here.
            </Text>
        </View>
    );
}
