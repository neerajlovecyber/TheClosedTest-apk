const { withGradleProperties } = require('@expo/config-plugins');

const withCustomGradleProperties = (config) => {
    return withGradleProperties(config, (config) => {
        const key = 'org.gradle.jvmargs';
        const value = '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

        const property = config.modResults.find((item) => item.key === key);
        if (property) {
            property.value = value;
        } else {
            config.modResults.push({
                type: 'property',
                key,
                value,
            });
        }
        return config;
    });
};

module.exports = withCustomGradleProperties;
