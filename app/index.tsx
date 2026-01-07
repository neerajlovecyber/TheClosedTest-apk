import { Redirect, Stack } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
      <Redirect href="/(tabs)" />
    </>
  );
}
