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
        plugins: [
            ...(config.plugins || []),
            [
                'expo-build-properties',
                {
                    android: {
                        // Gradle JVM memory for CI/CD (GitHub Actions has 7GB)
                        // This prevents OutOfMemoryError: Metaspace during builds
                        gradleProperties: {
                            'org.gradle.jvmargs': '-Xmx5g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError',
                            'org.gradle.daemon': 'true',
                            'org.gradle.parallel': 'true',
                            'org.gradle.caching': 'true',
                        },
                    },
                },
            ],
        ],
        extra: {
            ...config.extra,
            eas: {
                projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7"
            }
        },
    };
};
