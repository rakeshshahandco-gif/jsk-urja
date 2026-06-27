import Constants from 'expo-constants';

/**
 * WebView start URLs for JSK CRM mirror APK.
 * Secrets and API URLs stay inside the web CRM; the APK only loads the frontend URL.
 */
const CRM_WEB = {
  local: {
    crmWebUrl: 'http://10.0.2.2:4000',
    name: 'JSK CRM LOCAL',
    envName: 'LOCAL',
  },
  staging: {
    crmWebUrl: 'https://jsk-urja.onrender.com',
    name: 'JSK CRM TEST',
    envName: 'STAGING',
  },
  production: {
    crmWebUrl: 'https://jsk-urja.onrender.com',
    name: 'JSK CRM',
    envName: 'PRODUCTION',
  },
};

const getCrmWebConfig = () => {
  const extra = Constants.expoConfig?.extra;
  if (extra?.crmWebUrl) {
    const environment = extra.env || 'production';
    const base = CRM_WEB[environment] || CRM_WEB.production;
    return { ...base, crmWebUrl: extra.crmWebUrl };
  }
  const environment = extra?.env || 'production';
  return CRM_WEB[environment] || CRM_WEB.production;
};

export default getCrmWebConfig();
