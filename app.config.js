import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

export default ({ config }) => {
    const envPath = path.resolve(process.cwd(), '.env.production');

    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
    }

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
