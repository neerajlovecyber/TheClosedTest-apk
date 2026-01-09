import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
    TestIds,
} from 'react-native-google-mobile-ads';

// Production Ad Unit ID for App Slots
const AD_UNIT_ID_APP_SLOTS = __DEV__
    ? TestIds.REWARDED
    : 'ca-app-pub-3238435978294704/2016482105';

export function useRewardedAd(adUnitId: string = AD_UNIT_ID_APP_SLOTS) {
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [rewarded, setRewarded] = useState<RewardedAd | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 3;

    const loadAd = useCallback(() => {
        if (Platform.OS === 'web') return;

        setLoading(true);
        const ad = RewardedAd.createForAdRequest(adUnitId, {
            requestNonPersonalizedAdsOnly: true,
        });

        const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
            console.log('✅ Rewarded ad loaded successfully');
            setLoaded(true);
            setLoading(false);
            setRetryCount(0);
        });

        const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
            console.warn('⚠️ Rewarded ad failed to load:', error.message || error);
            setLoaded(false);
            setLoading(false);

            // Retry with exponential backoff
            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
                console.log(`🔄 Retrying ad load in ${delay / 1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                setTimeout(() => {
                    setRetryCount(prev => prev + 1);
                }, delay);
            }
        });

        setRewarded(ad);
        ad.load();

        return () => {
            unsubscribeLoaded();
            unsubscribeError();
        };
    }, [adUnitId, retryCount]);

    useEffect(() => {
        const cleanup = loadAd();
        return cleanup;
    }, [loadAd]);

    const showAd = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!rewarded || !loaded) {
                Alert.alert('Ad Not Ready', 'Please wait for the ad to load and try again.');
                resolve(false);
                return;
            }

            const unsubscribeEarned = rewarded.addAdEventListener(
                RewardedAdEventType.EARNED_REWARD,
                () => {
                    resolve(true);
                }
            );

            const unsubscribeClosed = rewarded.addAdEventListener(
                AdEventType.CLOSED,
                () => {
                    unsubscribeEarned();
                    unsubscribeClosed();
                    // Reload ad for next use
                    setLoaded(false);
                    loadAd();
                }
            );

            rewarded.show().catch((error) => {
                console.error('Failed to show rewarded ad:', error);
                unsubscribeEarned();
                unsubscribeClosed();
                resolve(false);
            });
        });
    }, [rewarded, loaded, loadAd]);

    return {
        loaded,
        loading,
        showAd,
        reload: loadAd,
    };
}

// Export the ad unit ID for direct usage if needed
export const APP_SLOTS_AD_UNIT_ID = AD_UNIT_ID_APP_SLOTS;
