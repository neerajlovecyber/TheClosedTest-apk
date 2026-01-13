import Toast from 'react-native-toast-message';

// Wrapper to mimic the sonner API used in the app
export const toast = {
    success: (title: string, options?: { description?: string }) => {
        Toast.show({
            type: 'success',
            text1: title,
            text2: options?.description,
        });
    },
    error: (title: string, options?: { description?: string }) => {
        Toast.show({
            type: 'error',
            text1: title,
            text2: options?.description,
        });
    },
    info: (title: string, options?: { description?: string }) => {
        Toast.show({
            type: 'info',
            text1: title,
            text2: options?.description,
        });
    },
    // Add other methods if needed (warning, etc.)
    message: (title: string, options?: { description?: string }) => {
        Toast.show({
            type: 'info', // Default to info for generic messages
            text1: title,
            text2: options?.description,
        });
    }
};
