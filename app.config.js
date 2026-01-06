import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export default ({ config }) => {
    // Priority: 
    // 1. Explicit APP_ENV
    // 2. EAS Build Profile
    // 3. Fallback to development
    const env = process.env.APP_ENV ||
        (process.env.EAS_BUILD_PROFILE === 'production' ? 'production' : 'development');

    let envPath = path.resolve(__dirname, `.env.${env}`);

    if (!fs.existsSync(envPath) && env === 'development') {
        envPath = path.resolve(__dirname, '.env.production');
    }

    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }

    console.log(`[Config] Env: ${env} | Convex: ${process.env.EXPO_PUBLIC_CONVEX_URL}`);

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
