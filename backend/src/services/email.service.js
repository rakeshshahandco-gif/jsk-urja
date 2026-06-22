import nodemailer from 'nodemailer';
import { EMAIL_PROVIDER_PRESETS } from '../constants/emailProvider.constants.js';

class EmailService {
    /** Normalize legacy companyProfile emailSettings or new EmailSettings document. */
    normalizeSettings(settings = {}) {
        if (!settings) return null;

        // Legacy companyProfile format: { emailId, appPassword, senderName, replyTo }
        if (settings.emailId && !settings.fromEmail && !settings.authUser) {
            return {
                provider: 'gmail',
                fromEmail: settings.emailId,
                authUser: settings.emailId,
                authPass: settings.appPassword,
                senderName: settings.senderName,
                replyTo: settings.replyTo || settings.emailId,
                smtpHost: EMAIL_PROVIDER_PRESETS.gmail.smtpHost,
                smtpPort: EMAIL_PROVIDER_PRESETS.gmail.smtpPort,
                smtpSecure: EMAIL_PROVIDER_PRESETS.gmail.smtpSecure,
            };
        }

        const provider = settings.provider || 'gmail';
        const preset = EMAIL_PROVIDER_PRESETS[provider] || EMAIL_PROVIDER_PRESETS.custom_smtp;
        return {
            provider,
            fromEmail: settings.fromEmail || settings.authUser || settings.emailId || '',
            authUser: settings.authUser || settings.fromEmail || settings.emailId || '',
            authPass: settings.authPass || settings.appPassword || '',
            senderName: settings.senderName || '',
            replyTo: settings.replyTo || settings.fromEmail || settings.authUser || settings.emailId || '',
            smtpHost: settings.smtpHost || preset.smtpHost,
            smtpPort: settings.smtpPort ?? preset.smtpPort,
            smtpSecure: settings.smtpSecure ?? preset.smtpSecure,
        };
    }

    buildTransport(settings) {
        const normalized = this.normalizeSettings(settings);
        if (!normalized) throw new Error('Email settings missing');

        const { provider, smtpHost, smtpPort, smtpSecure, authUser, authPass } = normalized;

        if (provider === 'gmail' && !smtpHost) {
            return nodemailer.createTransport({
                service: 'gmail',
                auth: { user: authUser, pass: authPass },
            });
        }

        return nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: Boolean(smtpSecure),
            auth: { user: authUser, pass: authPass },
        });
    }

    async verifyTransport(settings) {
        const transporter = this.buildTransport(settings);
        await transporter.verify();
        return true;
    }

    async sendEmail(settings, { to, subject, text, html, attachments }) {
        const normalized = this.normalizeSettings(settings);
        const transporter = this.buildTransport(normalized);

        const fromEmail = normalized.fromEmail || normalized.authUser;
        const mailOptions = {
            from: `"${normalized.senderName || 'JSK URJA'}" <${fromEmail}>`,
            to,
            subject,
            text,
            html,
            attachments,
            replyTo: normalized.replyTo || fromEmail,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            return info;
        } catch (error) {
            console.error('Email Sending Error:', error);
            throw new Error(`Email failed: ${error.message}`);
        }
    }
}

export default new EmailService();
