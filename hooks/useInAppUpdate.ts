import { useEffect } from 'react';
import { Platform } from 'react-native';
import SpInAppUpdates, {
    IAUUpdateKind,
    StartUpdateOptions,
} from 'sp-react-native-in-app-updates';
import * as Application from 'expo-application';

const inAppUpdates = new SpInAppUpdates(
    false // isDebug: Set to true only for testing with 'fake' updates in debug mode if needed, but usually better to test with internal app sharing
);

export function useInAppUpdate() {
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const checkAndUpdate = async () => {
            try {
                const result = await inAppUpdates.checkNeedsUpdate();

                if (result.shouldUpdate) {
                    const updateOptions: StartUpdateOptions = {
                        updateType: IAUUpdateKind.FLEXIBLE, // User can keep using the app while downloading
                    };

                    await inAppUpdates.startUpdate(updateOptions);
                }
            } catch (error) {
                // Fail silently so we don't disturb the user login flow if update check fails
                console.log('In-App Update check failed:', error);
            }
        };

        // Check for updates on mount
        checkAndUpdate();
    }, []);
}
