/** SMTP provider presets for per-company EmailSettings. */

export const EMAIL_PROVIDERS = ['gmail', 'outlook', 'zoho', 'custom_smtp'];

export const EMAIL_PROVIDER_PRESETS = {
    gmail: {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpSecure: false,
    },
    outlook: {
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        smtpSecure: false,
    },
    zoho: {
        smtpHost: 'smtp.zoho.com',
        smtpPort: 587,
        smtpSecure: false,
    },
    custom_smtp: {
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
    },
};
