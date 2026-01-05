import dotenv from 'dotenv';
import path from 'path';

export default ({ config }) => {
    const env = process.env.APP_ENV || 'development';
    const envPath = path.resolve(__dirname, `.env.${env}`);

    dotenv.config({ path: envPath });

    console.log(`[Config] Loading environment: ${env} from ${envPath}`);
    console.log(`[Config] Convex URL: ${process.env.EXPO_PUBLIC_CONVEX_URL}`);

    return {
        ...config,
        extra: {
            ...config.extra,
            eas: {
                projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7"
            }
        },
    };
};
