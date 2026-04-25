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
    apiUrl: 'http://localhost:5100/api/v1', 
    name: 'JSK CRM LOCAL',
    envName: 'LOCAL',
    version: '1.0.8',
  },
  staging: {
    // For Physical APK testing (Real Phone):
    // Using your Computer IP so the phone can reach your local backend.
    apiUrl: 'http://192.168.0.118:5100/api/v1', 
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
  const environment = Constants.expoConfig?.extra?.env || 'local';
  return ENV[environment] || ENV.local;
};

export default getEnvConfig();
