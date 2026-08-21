import React from 'react';
import { Linking, TouchableOpacity, View, TextStyle } from 'react-native';
import { Text } from '@/components/ui/text';

interface LinkableTextProps {
    text: string;
    className?: string;
    textClassName?: string;
    linkClassName?: string;
    style?: TextStyle;
}

export function LinkableText({ text, className, textClassName = "", linkClassName = "text-blue-500 underline", style }: LinkableTextProps) {
    const computedTextClassName = className || textClassName;
    // Regex to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = text.split(urlRegex);

    return (
        <Text className={computedTextClassName} style={style}>
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
