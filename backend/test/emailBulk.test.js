import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
    EMAIL_BULK_CAMPAIGN_STATUSES,
    EMAIL_BULK_DEFAULT_SETTINGS,
    EMAIL_BULK_SEND_CONTENT_TYPES,
} from '../src/constants/emailBulk.constants.js';
import { EMAIL_PROVIDERS } from '../src/constants/emailProvider.constants.js';
import { encryptCredential, decryptCredential, maskCredential } from '../src/utils/credentialCrypto.util.js';
import { normalizeEmail, dedupeRecipients } from '../src/services/emailBulkRecipient.service.js';
import {
    buildAttachmentRef,
    validateSendContentPayload,
} from '../src/services/emailBulkAttachment.service.js';
import EmailService from '../src/services/email.service.js';
import { ApiError } from '../src/utils/ApiError.js';

describe('emailBulk constants', () => {
    it('includes expected campaign statuses', () => {
        assert.ok(EMAIL_BULK_CAMPAIGN_STATUSES.includes('Draft'));
        assert.ok(EMAIL_BULK_CAMPAIGN_STATUSES.includes('Completed'));
    });

    it('defaults module to disabled', () => {
        assert.equal(EMAIL_BULK_DEFAULT_SETTINGS.enabled, false);
        assert.equal(EMAIL_BULK_DEFAULT_SETTINGS.defaultSendMode, 'SAFE');
    });
});

describe('emailProvider constants', () => {
    it('lists supported providers', () => {
        assert.ok(EMAIL_PROVIDERS.includes('gmail'));
        assert.ok(EMAIL_PROVIDERS.includes('custom_smtp'));
    });
});

describe('credentialCrypto.util', () => {
    it('encrypts and decrypts credentials', () => {
        const plain = 'secret-app-password';
        const enc = encryptCredential(plain);
        assert.notEqual(enc, plain);
        assert.equal(decryptCredential(enc), plain);
    });

    it('masks credentials', () => {
        assert.ok(maskCredential('abcdefghij').includes('*'));
    });
});

describe('emailBulkRecipient.service', () => {
    it('normalizes valid email', () => {
        assert.equal(normalizeEmail('User@Example.COM'), 'user@example.com');
    });

    it('rejects invalid email', () => {
        assert.equal(normalizeEmail('not-an-email'), null);
    });

    it('dedupes recipients and marks blacklist', () => {
        const blacklist = new Set(['user@example.com']);
        const out = dedupeRecipients([
            { email: 'user@example.com' },
            { email: 'user@example.com' },
            { email: 'other@example.com' },
        ], blacklist);
        assert.equal(out.length, 2);
        assert.equal(out.filter((r) => r.status === 'blacklisted').length, 1);
        assert.equal(out.filter((r) => r.status === 'pending').length, 1);
    });
});

describe('emailBulkAttachment.service', () => {
    it('buildAttachmentRef stores metadata only (no binary in object)', () => {
        const uploadDir = path.join(process.cwd(), 'uploads/email-bulk');
        fs.mkdirSync(uploadDir, { recursive: true });
        const fileName = `eb-test-${Date.now()}.pdf`;
        const absolute = path.join(uploadDir, fileName);
        fs.writeFileSync(absolute, Buffer.from('%PDF-1.4'));
        const ref = buildAttachmentRef({
            file: {
                filename: fileName,
                originalname: 'brochure.pdf',
                mimetype: 'application/pdf',
                size: 8,
            },
            companyId: '507f1f77bcf86cd799439011',
            userId: '507f1f77bcf86cd799439012',
        });
        assert.ok(ref.attachmentId);
        assert.equal(ref.mimeType, 'application/pdf');
        assert.equal(ref.sizeBytes, 8);
        assert.ok(ref.checksum);
        assert.ok(!JSON.stringify(ref).includes('base64'));
        fs.unlinkSync(absolute);
    });

    it('validateSendContentPayload rejects missing subject', () => {
        assert.throws(
            () => validateSendContentPayload({
                sendContentType: 'text_only',
                subject: '',
                bodyText: 'Hello',
                attachments: [],
            }),
            (err) => err instanceof ApiError,
        );
    });

    it('includes send content types', () => {
        assert.ok(EMAIL_BULK_SEND_CONTENT_TYPES.includes('html_with_attachment'));
    });
});

describe('email.service', () => {
    it('normalizes legacy companyProfile settings', () => {
        const normalized = EmailService.normalizeSettings({
            emailId: 'test@gmail.com',
            appPassword: 'pass',
            senderName: 'Acme',
        });
        assert.equal(normalized.fromEmail, 'test@gmail.com');
        assert.equal(normalized.authPass, 'pass');
        assert.equal(normalized.provider, 'gmail');
    });

    it('normalizes new EmailSettings document', () => {
        const normalized = EmailService.normalizeSettings({
            provider: 'outlook',
            fromEmail: 'user@company.com',
            authUser: 'user@company.com',
            authPass: 'secret',
            smtpHost: 'smtp.office365.com',
            smtpPort: 587,
        });
        assert.equal(normalized.provider, 'outlook');
        assert.equal(normalized.smtpHost, 'smtp.office365.com');
    });

    it('buildTransport accepts legacy settings without throwing on config', () => {
        const transport = EmailService.buildTransport({
            emailId: 'test@gmail.com',
            appPassword: 'pass',
        });
        assert.ok(transport);
    });
});
