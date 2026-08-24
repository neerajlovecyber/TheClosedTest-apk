const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }) => {
  return {
    ...config,
    name: IS_DEV ? "The Closed Test (Dev)" : "The Closed Test",
    scheme: IS_DEV ? "theclosedtest-dev" : "theclosedtest",
    android: {
      ...config.android,
      package: IS_DEV ? "com.theneerajsec.theclosedtest.dev" : "com.theneerajsec.theclosedtest",
    },
    ios: {
      ...config.ios,
      bundleIdentifier: IS_DEV ? "com.theneerajsec.theclosedtest.dev" : "com.theneerajsec.theclosedtest",
    },
    extra: {
      ...config.extra,
      eas: {
        projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7",
      },
    },
  };
};
