import nodemailer from 'nodemailer';

class EmailService {
    async sendEmail(settings, { to, subject, text, html, attachments }) {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: settings.emailId,
                pass: settings.appPassword
            }
        });

        const mailOptions = {
            from: `"${settings.senderName || 'SHREEJAL'}" <${settings.emailId}>`,
            to,
            subject,
            text,
            html,
            attachments,
            replyTo: settings.replyTo || settings.emailId
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
