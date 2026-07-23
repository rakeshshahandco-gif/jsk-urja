import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    WHATSAPP_BULK_DEFAULT_SETTINGS,
    WHATSAPP_BULK_SAFE_MODE_WARNING,
} from '../src/constants/whatsappBulk.constants.js';
import {
    isBulkSimulateMode,
    bulkSendDelay,
    setBulkSendDelayImpl,
    resetBulkSendDelayImpl,
    randomBulkDelayMs,
} from '../src/services/whatsappBulkSafeMode.util.js';

describe('whatsappBulk safe mode defaults', () => {
    it('defaults Safe Mode delays to 20-30 seconds', () => {
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.safeDelayMinMs, 20000);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.safeDelayMaxMs, 30000);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.safeModeEnabled, true);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.aiAssistantEnabled, false);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.requireManualApproval, true);
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.mandatoryTestSend, true);
    });

    it('exports risk warning without block-proof claims', () => {
        assert.match(WHATSAPP_BULK_SAFE_MODE_WARNING, /cannot guarantee/i);
        assert.doesNotMatch(WHATSAPP_BULK_SAFE_MODE_WARNING, /block-proof|guaranteed safe|never block/i);
    });
});

describe('whatsappBulk simulate mode', () => {
    it('honours simulateSend setting and env', () => {
        assert.equal(isBulkSimulateMode({ simulateSend: true }), true);
        assert.equal(isBulkSimulateMode({ simulateSend: false }), false);
        const prev = process.env.WHATSAPP_BULK_SIMULATE;
        process.env.WHATSAPP_BULK_SIMULATE = 'true';
        assert.equal(isBulkSimulateMode({ simulateSend: false }), true);
        if (prev === undefined) delete process.env.WHATSAPP_BULK_SIMULATE;
        else process.env.WHATSAPP_BULK_SIMULATE = prev;
    });
});

describe('whatsappBulk injectable send delay', () => {
    afterEach(() => {
        resetBulkSendDelayImpl();
    });

    it('uses injectable delay (no real 20-30s wait)', async () => {
        const calls = [];
        setBulkSendDelayImpl(async (ms) => {
            calls.push(ms);
        });
        await bulkSendDelay(25000);
        await bulkSendDelay(30000);
        assert.deepEqual(calls, [25000, 30000]);
    });

    it('randomBulkDelayMs stays within configured bounds', () => {
        for (let i = 0; i < 40; i += 1) {
            const d = randomBulkDelayMs(20000, 30000);
            assert.ok(d >= 20000 && d <= 30000);
        }
    });
});

describe('whatsappBulk AI assistant (template / null provider)', () => {
    it('AI assistant disabled by default', () => {
        assert.equal(WHATSAPP_BULK_DEFAULT_SETTINGS.aiAssistantEnabled, false);
    });

    it('draft templates cover en/hi/gu with opt-out wording', async () => {
        // Read source to avoid Mongo; templates are deterministic null_template_v1
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(
            path.join(process.cwd(), 'src/services/whatsappBulkAiAssist.service.js'),
            'utf8',
        );
        assert.match(src, /PROVIDER = 'null_template_v1'/);
        assert.match(src, /networkCalled: false/);
        assert.match(src, /outboundSent: false/);
        assert.match(src, /status: 'DRAFT'/);
        assert.match(src, /requiresHumanReview: true/);
        assert.match(src, /Reply STOP to opt out/);
        assert.match(src, /STOP लिखकर/);
        assert.match(src, /opt-out કરો/);
        assert.doesNotMatch(src, /OPENAI|ANTHROPIC|api\.openai|fetch\(/i);
        assert.doesNotMatch(src, /approveCampaign|processQueue|dispatchBulkWhatsAppSend/);
        assert.match(src, /spamWarning.*free\|winner\|urgent/i);
    });

    it('rejects when AI assistant disabled (injected settings)', async () => {
        const { ApiError } = await import('../src/utils/ApiError.js');
        const { runAiAssist } = await import('../src/services/whatsappBulkAiAssist.service.js');
        await assert.rejects(
            () => runAiAssist('000000000000000000000001', 'draft_message', { language: 'en' }, {
                settings: { aiAssistantEnabled: false },
            }),
            (err) => err instanceof ApiError && err.statusCode === 403,
        );
    });

    it('produces DRAFT multilingual drafts when enabled (injected settings)', async () => {
        const { runAiAssist } = await import('../src/services/whatsappBulkAiAssist.service.js');
        const settings = {
            aiAssistantEnabled: true,
            defaultBatchSize: 10,
            dailyLimit: 50,
            sendWindowStart: '09:00',
            sendWindowEnd: '19:00',
            defaultTimezone: 'Asia/Kolkata',
        };
        for (const language of ['en', 'hi', 'gu']) {
            const out = await runAiAssist('000000000000000000000001', 'draft_message', {
                language,
                name: 'Test',
                productInterest: 'Solar',
                category: 'Dealer',
            }, { settings });
            assert.equal(out.status, 'DRAFT');
            assert.equal(out.requiresHumanReview, true);
            assert.equal(out.networkCalled, false);
            assert.equal(out.outboundSent, false);
            assert.equal(out.provider, 'null_template_v1');
            assert.ok(out.draftText.includes('Test') || out.draftText.includes('Solar'));
            assert.match(out.draftText, /STOP|opt-out|ऑप्ट-आउट/i);
        }

        const spam = await runAiAssist('000000000000000000000001', 'validate_recipients', {
            mobiles: ['9876543210'],
            messageBody: 'URGENT free winner click here lottery',
        }, { settings, blacklist: new Set() });
        assert.equal(spam.status, 'DRAFT');
        assert.match(String(spam.spamWarning || ''), /spam/i);
        assert.equal(spam.networkCalled, false);
        assert.equal(spam.outboundSent, false);
    });
});
