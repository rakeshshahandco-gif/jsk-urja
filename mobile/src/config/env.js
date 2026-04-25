import Constants from 'expo-constants';

const ENV = {
  local: {
    apiUrl: 'http://10.0.2.2:5100/api/v1', // Standard for Android Emulator to reach Laptop
    name: 'JSK CRM LOCAL',
    envName: 'LOCAL',
    version: '1.0.8',
  },
  staging: {
    apiUrl: 'https://jsk-urja-staging.onrender.com/api/v1',
    name: 'JSK CRM TEST',
    envName: 'STAGING',
    version: '1.0.8',
  },
  production: {
    apiUrl: 'https://jsk-urja-backend.onrender.com/api/v1',
    name: 'JSK CRM',
    envName: 'PRODUCTION',
    version: '1.0.8',
  }
};

const getEnvConfig = () => {
  // Pull the environment from expo config (extra field)
  const environment = Constants.expoConfig?.extra?.env || 'local';
  return ENV[environment] || ENV.local;
};

export default getEnvConfig();
