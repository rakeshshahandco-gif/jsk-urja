import Constants from 'expo-constants';

/**
 * ENVIRONMENT CONFIGURATION
 * 
 * 1. LOCAL/STAGING: Use this for testing on your computer or Physical Phone.
 *    Points to your Local Computer IP: 192.168.0.118
 * 
 * 2. PRODUCTION: Use this for the final APK upload.
 *    Points to Render: https://jsk-urja-backend.onrender.com/api/v1
 */

const ENV = {
  local: {
    // For Web Browser testing:
    apiUrl: 'http://localhost:5000/api/v1', 
    name: 'JSK CRM LOCAL',
    envName: 'LOCAL',
    version: '2.1.7',
  },
  staging: {
    // Staging APK still uses Render live DB (same as production).
    apiUrl: 'https://jsk-urja-backend.onrender.com/api/v1',
    name: 'JSK CRM TEST',
    envName: 'STAGING',
    version: '2.1.7',
  },
  production: {
    apiUrl: 'https://jsk-urja-backend.onrender.com/api/v1',
    name: 'JSK CRM',
    envName: 'PRODUCTION',
    version: '2.1.7',
  }
};

const getEnvConfig = () => {
  const baked = Constants.expoConfig?.extra?.env;
  const webApiOverride = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MOBILE_API;
  // Release APK must always use Render unless explicitly built as "local".
  const environment = baked || webApiOverride || (__DEV__ ? 'local' : 'production');
  const cfg = ENV[environment] || ENV.production;
  if (!__DEV__ && environment !== 'local' && !String(cfg.apiUrl).includes('onrender.com')) {
    return ENV.production;
  }
  return cfg;
};

export default getEnvConfig();
