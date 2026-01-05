import React from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { RefreshCwIcon, XIcon } from 'lucide-react-native';

interface UpdateBannerProps {
    onReload: () => void;
    isVisible: boolean;
}

export function UpdateBanner({ onReload, isVisible }: UpdateBannerProps) {
    const translateY = React.useRef(new Animated.Value(-100)).current;

    React.useEffect(() => {
        Animated.spring(translateY, {
            toValue: isVisible ? 0 : -100,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
        }).start();
    }, [isVisible]);

    if (!isVisible) return null;

    return (
        <Animated.View
            style={{
                transform: [{ translateY }],
                position: 'absolute',
                top: 50, // Avoid status bar area roughly
                left: 16,
                right: 16,
                zIndex: 1000,
            }}
        >
            <View className="bg-primary px-4 py-3 rounded-2xl flex-row items-center justify-between shadow-lg shadow-primary/30">
                <View className="flex-row items-center flex-1 gap-3">
                    <View className="bg-white/20 p-2 rounded-full">
                        <Icon as={RefreshCwIcon} className="text-white size-4" />
                    </View>
                    <View className="flex-1">
                        <Text className="text-white font-bold text-sm">Update Ready!</Text>
                        <Text className="text-white/80 text-xs">Reload to apply the latest changes.</Text>
                    </View>
                </View>
                <TouchableOpacity
                    onPress={onReload}
                    className="bg-white px-4 py-2 rounded-xl"
                >
                    <Text className="text-primary font-bold text-xs">RELOAD</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}
