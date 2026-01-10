const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Custom Expo config plugin to disable Android lint checks
 * This prevents OutOfMemoryError during lintVitalAnalyzeRelease tasks
 */
function withDisableLint(config) {
    return withAppBuildGradle(config, (config) => {
        let buildGradle = config.modResults.contents;

        // Check if lintOptions already exists
        if (buildGradle.includes('lintOptions')) {
            console.log('⚠️  lintOptions already exists in build.gradle');
            return config;
        }

        // Find the android block and inject lintOptions
        const androidBlockRegex = /android\s*{/;

        if (androidBlockRegex.test(buildGradle)) {
            buildGradle = buildGradle.replace(
                androidBlockRegex,
                `android {
    lintOptions {
        checkReleaseBuilds false
        abortOnError false
        ignoreWarnings true
    }`
            );

            console.log('✅ Successfully added lintOptions to disable lint checks');
            config.modResults.contents = buildGradle;
        } else {
            console.warn('⚠️  Could not find android block in build.gradle');
        }

        return config;
    });
}

module.exports = withDisableLint;
