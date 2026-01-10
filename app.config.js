import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export default ({ config }) => {
    // Always load production environment - we only use production Convex
    const envPath = path.resolve(__dirname, '.env.production');

    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
    }

    console.log(`[Config] Convex: ${process.env.EXPO_PUBLIC_CONVEX_URL}`);

    return {
        ...config,
        entryPoint: './index.js',
        extra: {
            ...config.extra,
            eas: {
                projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7"
            }
        },
    };
};
