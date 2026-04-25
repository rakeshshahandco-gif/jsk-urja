export default ({ config }) => {
  const env = process.env.APP_ENV || 'local';

  const names = {
    local: 'JSK CRM LOCAL',
    staging: 'JSK CRM TEST',
    production: 'JSK CRM',
  };

  const packages = {
    local: 'com.jskurja.crm.local',
    staging: 'com.jskurja.crm.staging',
    production: 'com.jskurja.crm',
  };

  return {
    ...config,
    name: names[env],
    slug: 'jsk-urja-tasks',
    android: {
      ...config.android,
      package: packages[env],
    },
    extra: {
      ...config.extra,
      env: env,
      eas: {
        projectId: "734d6e73-c490-453c-9b43-5b5964dc19b6"
      }
    },
  };
};
