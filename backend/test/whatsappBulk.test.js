import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
    WHATSAPP_BULK_CAMPAIGN_STATUSES,
    WHATSAPP_BULK_DEFAULT_SETTINGS,
    WHATSAPP_BULK_SEND_CONTENT_TYPES,
} from '../src/constants/whatsappBulk.constants.js';
import { normalizeMobile, dedupeRecipients, processRecipientCandidates, extractLeadMobiles } from '../src/services/whatsappBulkRecipient.service.js';
import { applyBusinessCategoryFilter } from '../src/services/whatsappBulkBusinessCategory.service.js';
import {
    buildImageAttachmentRef,
    resolveCampaignAttachment,
    validateSendContentPayload,
} from '../src/services/whatsappBulkAttachment.service.js';
import { ApiError } from '../src/utils/ApiError.js';

describe('whatsappBulk constants', () => {
    it('includes expected campaign statuses', () => {
        assert.ok(WHATSAPP_BULK_CAMPAIGN_STATUSES.includes('Draft'));
        assert.ok(WHATSAPP_BULK_CAMPAIGN_STATUSES.includes('Completed'));
    });

    it('defaults module to disabled', () => {
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.enabled, false);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.defaultSendMode, 'SAFE');
    });
});

describe('whatsappBulkRecipient.service', () => {
    it('normalizes 10-digit Indian mobile', () => {
        assert.equal(normalizeMobile('9876543210'), '919876543210');
    });

    it('dedupes recipients and marks blacklist', () => {
        const blacklist = new Set(['919876543210']);
        const out = dedupeRecipients([
            { mobile: '9876543210' },
            { mobile: '9876543210' },
            { mobile: '9123456789' },
        ], blacklist);
        assert.equal(out.length, 2);
        assert.equal(out.filter((r) => r.status === 'blacklisted').length, 1);
        assert.equal(out.filter((r) => r.status === 'pending').length, 1);
    });

    it('processRecipientCandidates reports summary stats', () => {
        const blacklist = new Set(['919999999999']);
        const result = processRecipientCandidates([
            { mobile: '9876543210', displayName: 'A', sourceRef: '1' },
            { mobile: '9876543210', displayName: 'A dup', sourceRef: '2' },
            { mobile: 'invalid', displayName: 'Bad' },
            { mobile: '919999999999', displayName: 'Blocked', sourceRef: '3' },
            { mobile: '9123456789', displayName: 'B', sourceRef: '4' },
        ], blacklist);
        assert.equal(result.totalFound, 5);
        assert.equal(result.duplicateSkipped, 1);
        assert.equal(result.invalidSkipped, 1);
        assert.equal(result.optOutSkipped, 1);
        assert.equal(result.validNumbers, 2);
        assert.equal(result.finalSelected, 2);
    });

    it('extractLeadMobiles reads customerMobile and whatsapp normalized', () => {
        const rows = extractLeadMobiles({
            customerName: 'Lead Co',
            customerMobile: '9876543210',
            whatsapp: { normalizedMobile: '919876543211' },
        });
        assert.equal(rows.length, 2);
    });

    it('applyBusinessCategoryFilter sets customer type or category match', () => {
        const query = { isDeleted: { $ne: true } };
        applyBusinessCategoryFilter(query, 'Dealer');
        assert.ok(query.$or);
        assert.equal(query.$or.length, 2);
        const allQuery = {};
        applyBusinessCategoryFilter(allQuery, 'All');
        assert.equal(allQuery.$or, undefined);
    });
});

describe('whatsappBulkAttachment.service', () => {
    it('buildImageAttachmentRef stores metadata only (no binary in object)', () => {
        const uploadDir = path.join(process.cwd(), 'uploads/whatsapp-bulk');
        fs.mkdirSync(uploadDir, { recursive: true });
        const fileName = `wb-test-${Date.now()}.jpg`;
        const absolute = path.join(uploadDir, fileName);
        fs.writeFileSync(absolute, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
        const ref = buildImageAttachmentRef({
            file: {
                filename: fileName,
                originalname: 'photo.jpg',
                mimetype: 'image/jpeg',
                size: 4,
            },
            companyId: '507f1f77bcf86cd799439011',
            userId: '507f1f77bcf86cd799439012',
        });
        assert.ok(ref.attachmentId);
        assert.equal(ref.mimeType, 'image/jpeg');
        assert.equal(ref.sizeBytes, 4);
        assert.ok(ref.checksum);
        assert.ok(!JSON.stringify(ref).includes('base64'));
        fs.unlinkSync(absolute);
    });

    it('validateSendContentPayload rejects missing image for image modes', () => {
        assert.throws(
            () => validateSendContentPayload({
                sendContentType: 'image_with_caption',
                messageBody: 'Hello',
                imageAttachment: null,
                absolutePath: '',
            }),
            (err) => err instanceof ApiError,
        );
    });

    it('validateSendContentPayload accepts text_only with message', () => {
        assert.doesNotThrow(() => validateSendContentPayload({
            sendContentType: 'text_only',
            messageBody: 'Hello',
            imageAttachment: null,
            absolutePath: '',
        }));
    });

    it('resolveCampaignAttachment prefers imageAttachment ref', () => {
        const { ref, absolutePath } = resolveCampaignAttachment({
            imageAttachment: {
                filePath: 'uploads/whatsapp-bulk/wb-demo.jpg',
                fileName: 'wb-demo.jpg',
                mimeType: 'image/jpeg',
            },
            attachmentPath: 'uploads/whatsapp-bulk/legacy.jpg',
        });
        assert.equal(ref.fileName, 'wb-demo.jpg');
        assert.ok(absolutePath.endsWith('wb-demo.jpg'));
    });

    it('includes send content types', () => {
        assert.ok(WHATSAPP_BULK_SEND_CONTENT_TYPES.includes('image_with_caption'));
    });
});

describe('whatsappBulkCampaign parseNumbersFromUpload', () => {
    it('parses txt file numbers', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const dir = path.join(process.cwd(), 'uploads/whatsapp-bulk');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `wb-parse-test-${Date.now()}.txt`);
        fs.writeFileSync(file, '9876543210\n919876543211');
        const rel = path.relative(process.cwd(), file);
        const { parseNumbersFromUpload } = await import('../src/services/whatsappBulkCampaign.service.js');
        const out = await parseNumbersFromUpload(rel, 'txt_upload');
        assert.ok(out.count >= 2);
        fs.unlinkSync(file);
    });
});

describe('whatsappBulkDispatch.service', () => {
    it('resolveBulkSenderUserId prefers acting user then campaign updatedBy', async () => {
        const { resolveBulkSenderUserId } = await import('../src/services/whatsappBulkDispatch.service.js');
        assert.equal(
            resolveBulkSenderUserId({ createdBy: 'aaa', updatedBy: 'bbb' }, 'ccc'),
            'ccc',
        );
        assert.equal(resolveBulkSenderUserId({ createdBy: 'aaa', updatedBy: 'bbb' }), 'bbb');
        assert.throws(() => resolveBulkSenderUserId(null, null), /No WhatsApp sender user/);
    });
});
