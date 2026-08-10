import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    sanitizeOriginalFilename,
    buildRelativeMediaPath,
    resolveSafeMediaAbsolute,
    writeMediaBufferAtomic,
    mediaFileExists,
    WHATSAPP_MEDIA_ROOT_REL,
    extractMediaMetaFromEnvelope,
    reviveMediaBuffersInEnvelope,
} from '../src/services/whatsappMediaStorage.service.js';
import { normalizeBaileysInbound } from '../src/services/whatsappMessageNormalize.js';

describe('whatsappMediaStorage', () => {
    it('sanitizes dangerous filenames', () => {
        assert.equal(sanitizeOriginalFilename('../../etc/passwd'), 'passwd');
        assert.ok(!sanitizeOriginalFilename('a/b\\c.jpg').includes('/'));
        assert.ok(!sanitizeOriginalFilename('a/b\\c.jpg').includes('\\'));
        assert.match(sanitizeOriginalFilename('CON'), /^_/);
    });

    it('builds relative path under storage/whatsapp-media', () => {
        const { relativeFilePath, safeFileName } = buildRelativeMediaPath({
            companyId: 'co1',
            sessionUserId: 'user1',
            messageId: 'MID123',
            mimeType: 'image/jpeg',
            originalFileName: 'photo.jpg',
            when: new Date('2026-08-05T00:00:00Z'),
        });
        assert.ok(relativeFilePath.startsWith(`${WHATSAPP_MEDIA_ROOT_REL}/co1/user1/2026/08/`));
        assert.match(safeFileName, /\.jpg$/);
        assert.ok(!path.isAbsolute(relativeFilePath));
        assert.ok(!relativeFilePath.includes('..'));
    });

    it('blocks path traversal', () => {
        assert.throws(() => resolveSafeMediaAbsolute('storage/whatsapp-media/../secret'));
        assert.throws(() => resolveSafeMediaAbsolute('D:/abs/file.jpg'));
        assert.throws(() => resolveSafeMediaAbsolute('uploads/other/x.jpg'));
    });

    it('writes atomically and reuses existing file', async () => {
        const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4]);
        const first = await writeMediaBufferAtomic({
            buffer: buf,
            companyId: 'testco',
            sessionUserId: 'testuser',
            messageId: `t-${Date.now()}`,
            mimeType: 'image/jpeg',
            originalFileName: 'x.jpg',
        });
        assert.equal(first.reused, false);
        assert.ok(mediaFileExists(first.relativeFilePath));
        const second = await writeMediaBufferAtomic({
            buffer: buf,
            companyId: 'testco',
            sessionUserId: 'testuser',
            messageId: 'ignored',
            mimeType: 'image/jpeg',
            existingRelativePath: first.relativeFilePath,
        });
        assert.equal(second.reused, true);
        assert.equal(second.relativeFilePath, first.relativeFilePath);
        // cleanup
        try {
            fs.unlinkSync(resolveSafeMediaAbsolute(first.relativeFilePath));
        } catch { /* ignore */ }
    });

    it('extracts mediaMeta without logging keys', () => {
        const key = Buffer.from('0123456789abcdef0123456789abcdef');
        const env = {
            key: { id: 'M1', remoteJid: 'x@s.whatsapp.net' },
            message: {
                imageMessage: {
                    mimetype: 'image/jpeg',
                    caption: 'cap',
                    mediaKey: key,
                    url: 'https://example.com/m',
                    directPath: '/v/t',
                    fileLength: 12,
                },
            },
        };
        const meta = extractMediaMetaFromEnvelope(env);
        assert.equal(meta.contentType, 'imageMessage');
        assert.equal(meta.caption, 'cap');
        assert.ok(meta.mediaKeyB64);
        assert.equal(Buffer.from(meta.mediaKeyB64, 'base64').equals(key), true);
    });

    it('revives Buffer JSON shape', () => {
        const revived = reviveMediaBuffersInEnvelope({
            message: {
                imageMessage: {
                    mediaKey: { type: 'Buffer', data: [1, 2, 3, 4] },
                },
            },
        });
        assert.ok(Buffer.isBuffer(revived.message.imageMessage.mediaKey));
        assert.deepEqual([...revived.message.imageMessage.mediaKey], [1, 2, 3, 4]);
    });

    it('normalizes wrapped image with caption', () => {
        const r = normalizeBaileysInbound({
            message: {
                ephemeralMessage: {
                    message: {
                        imageMessage: {
                            caption: 'Image mirror test 2',
                            mimetype: 'image/jpeg',
                        },
                    },
                },
            },
        }, { messageId: 'img1' });
        assert.equal(r.mediaType, 'image');
        assert.equal(r.caption, 'Image mirror test 2');
        assert.match(r.text, /Image mirror test 2/);
    });

    it('normalizes documentWithCaptionMessage', () => {
        const r = normalizeBaileysInbound({
            message: {
                documentWithCaptionMessage: {
                    message: {
                        documentMessage: {
                            fileName: 'spec.pdf',
                            mimetype: 'application/pdf',
                            caption: 'PDF note',
                        },
                    },
                },
            },
        }, { messageId: 'doc1' });
        assert.equal(r.mediaType, 'document');
        assert.match(r.text, /PDF note|spec\.pdf/);
    });
});

// silence unused
void os;
void path;
