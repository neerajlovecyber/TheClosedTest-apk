import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import pkg from './package.json';

export default ({ config }) => {
    // Always load production environment - we only use production Convex

    const envPath = path.resolve(__dirname, '.env.production');

    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }

    console.log(`[Config] Convex: ${process.env.EXPO_PUBLIC_CONVEX_URL}`);

    return {
        ...config,
        version: pkg.version,
        extra: {
            ...config.extra,
            eas: {
                projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7"
            }
        },
    };
};
