import React from 'react';
import { Linking, TouchableOpacity, View, TextStyle } from 'react-native';
import { Text } from '@/components/ui/text';

interface LinkableTextProps {
    text: string;
    textClassName?: string;
    linkClassName?: string;
    style?: TextStyle;
}

export function LinkableText({ text, textClassName = "", linkClassName = "text-blue-500 underline", style }: LinkableTextProps) {
    // Regex to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = text.split(urlRegex);

    return (
        <Text className={textClassName} style={style}>
            {parts.map((part, index) => {
                if (part.match(urlRegex)) {
                    return (
                        <Text
                            key={index}
                            className={linkClassName}
                            onPress={() => Linking.openURL(part)}
                        >
                            {part}
                        </Text>
                    );
                }
                return <Text key={index}>{part}</Text>;
            })}
        </Text>
    );
}
