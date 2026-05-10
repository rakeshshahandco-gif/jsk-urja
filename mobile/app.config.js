export default ({ config }) => {
  const env = process.env.APP_ENV || 'local';

  const names = {
    local: 'SHREEJAL CRM LOCAL',
    staging: 'SHREEJAL CRM TEST',
    production: 'SHREEJAL CRM',
  };

  const packages = {
    local: 'com.shreejal.crm.local',
    staging: 'com.shreejal.crm.staging',
    production: 'com.shreejal.crm',
  };

  return {
    ...config,
    name: names[env],
    slug: 'shreejal-tasks',
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
