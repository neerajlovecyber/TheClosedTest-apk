import { Text } from '@/components/ui/text';
import { View } from 'react-native';

export default function MarketplaceScreen() {
    return (
        <View className="flex-1 items-center justify-center bg-background p-4">
            <Text className="text-2xl font-bold">Marketplace</Text>
            <Text className="text-muted-foreground mt-2 text-center">
                Browse and discover apps to test.
            </Text>
        </View>
    );
}
