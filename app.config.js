export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        projectId: "5ef1829f-e48b-4b44-ace2-2e4fd488e2c7",
      },
    },
  };
};
