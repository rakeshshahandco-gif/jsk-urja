import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    WHATSAPP_AI_DEFAULT_SETTINGS,
    WHATSAPP_AI_FEATURE_PATH,
    WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS,
    WHATSAPP_AI_PERMISSIONS,
    assertNoForbiddenSettingsKeys,
    canKnowledgeBeActive,
    resolveKnowledgeActive,
} from '../src/modules/whatsappAi/constants/whatsappAi.constants.js';
import { assertNoBinaryPayload } from '../src/modules/whatsappAi/models/sharedFields.js';
import WhatsAppAIMessage from '../src/modules/whatsappAi/models/WhatsAppAIMessage.model.js';
import WhatsAppAISettings from '../src/modules/whatsappAi/models/WhatsAppAISettings.model.js';
import WhatsAppAIKnowledge from '../src/modules/whatsappAi/models/WhatsAppAIKnowledge.model.js';
import WhatsAppAICustomerMemory from '../src/modules/whatsappAi/models/WhatsAppAICustomerMemory.model.js';
import * as auditService from '../src/modules/whatsappAi/services/audit.service.js';
import { applyKnowledgeActiveSafety } from '../src/modules/whatsappAi/services/knowledge.service.js';
import { DEFAULT_COMPANY_FEATURE_SETTINGS } from '../src/constants/companyFeatureSettings.defaults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('whatsappAi phase1a foundation', () => {
    it('feature flag defaults to false in company feature settings', () => {
        assert.equal(WHATSAPP_AI_FEATURE_PATH, 'communication.whatsappAiEnabled');
        assert.equal(DEFAULT_COMPANY_FEATURE_SETTINGS.communication.whatsappAiEnabled, false);
        assert.equal(DEFAULT_COMPANY_FEATURE_SETTINGS.communication.enableWhatsappBulk, false);
    });

    it('settings defaults are disabled', () => {
        assert.equal(WHATSAPP_AI_DEFAULT_SETTINGS.enabled, false);
        assert.equal(WHATSAPP_AI_DEFAULT_SETTINGS.mode, 'disabled');
        assert.equal(WHATSAPP_AI_DEFAULT_SETTINGS.featureVersion, '1a');
    });

    it('settings model schema defaults match constants', () => {
        const paths = WhatsAppAISettings.schema.paths;
        assert.equal(paths.enabled.defaultValue, false);
        assert.equal(paths.mode.defaultValue, 'disabled');
    });

    it('rejects forbidden settings keys', () => {
        assert.ok(WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS.includes('apiKey'));
        assert.ok(WHATSAPP_AI_FORBIDDEN_SETTINGS_KEYS.includes('openaiApiKey'));
        assert.throws(
            () => assertNoForbiddenSettingsKeys({ apiKey: 'sk-test' }),
            (err) => err.statusCode === 400 && /Forbidden settings field/.test(err.message),
        );
        assert.doesNotThrow(() => assertNoForbiddenSettingsKeys({ enabled: true, mode: 'dry_run' }));
        assert.equal(WhatsAppAISettings.schema.path('apiKey'), undefined);
        assert.equal(WhatsAppAISettings.schema.path('openaiApiKey'), undefined);
    });

    it('rejects binary/base64 payloads', () => {
        assert.throws(
            () => assertNoBinaryPayload({ base64: 'AAAA' }),
            (err) => err.statusCode === 400,
        );
        assert.throws(
            () => assertNoBinaryPayload({ note: 'data:image/png;base64,abc' }),
            (err) => err.statusCode === 400,
        );
        assert.doesNotThrow(() => assertNoBinaryPayload({
            fileName: 'a.pdf',
            fileUrl: 'https://example.com/a.pdf',
            storageReference: 'uploads/a.pdf',
        }));
    });

    it('permission constants exist in module.submodule.action form', () => {
        const expected = [
            'whatsapp_ai.module.view',
            'whatsapp_ai.module.archive',
            'whatsapp_ai.module.takeover',
            'whatsapp_ai.module.return_to_ai',
            'whatsapp_ai.settings.manage',
            'whatsapp_ai.knowledge.manage',
            'whatsapp_ai.knowledge.approve',
            'whatsapp_ai.conversations.view_all',
            'whatsapp_ai.conversations.view_assigned',
            'whatsapp_ai.lead_draft.create',
            'whatsapp_ai.lead_draft.approve',
            'whatsapp_ai.documents.manage',
            'whatsapp_ai.documents.share',
            'whatsapp_ai.audit.view',
            'whatsapp_ai.dashboard.view',
            'whatsapp_ai.testing.inbound',
        ];
        for (const key of expected) {
            assert.ok(Object.values(WHATSAPP_AI_PERMISSIONS).includes(key), 'missing ' + key);
        }
    });

    it('message schema has unique partial indexes for providerMessageId and idempotencyKey', () => {
        const indexes = WhatsAppAIMessage.schema.indexes();
        const names = indexes.map((entry) => entry[1]?.name).filter(Boolean);
        assert.ok(names.includes('uniq_company_providerMessageId'));
        assert.ok(names.includes('uniq_company_idempotencyKey'));
        const byName = Object.fromEntries(indexes.map((entry) => [entry[1]?.name, entry]));
        assert.equal(byName.uniq_company_providerMessageId[1].unique, true);
        assert.equal(byName.uniq_company_idempotencyKey[1].unique, true);
        assert.deepEqual(Object.keys(byName.uniq_company_providerMessageId[0]), ['companyId', 'providerMessageId']);
        assert.deepEqual(Object.keys(byName.uniq_company_idempotencyKey[0]), ['companyId', 'idempotencyKey']);
    });

    it('same providerMessageId uniqueness is company-scoped (not global)', () => {
        const indexes = WhatsAppAIMessage.schema.indexes();
        const hit = indexes.find((entry) => entry[1]?.name === 'uniq_company_providerMessageId');
        assert.ok(hit);
        assert.equal(hit[0].companyId, 1);
        assert.equal(hit[0].providerMessageId, 1);
        assert.equal(Object.keys(hit[0]).length, 2);
    });

    it('action log service exports append+list only (no update/delete)', () => {
        assert.equal(typeof auditService.appendActionLog, 'function');
        assert.equal(typeof auditService.listActionLogs, 'function');
        assert.equal(auditService.updateActionLog, undefined);
        assert.equal(auditService.deleteActionLog, undefined);
        assert.equal(auditService.update, undefined);
        assert.equal(auditService.remove, undefined);
    });

    it('knowledge defaults to draft and inactive', () => {
        assert.equal(WhatsAppAIKnowledge.schema.paths.approvalStatus.defaultValue, 'draft');
        assert.equal(WhatsAppAIKnowledge.schema.paths.active.defaultValue, false);
        assert.equal(WhatsAppAIKnowledge.schema.paths.approvedBy.defaultValue, null);
        assert.equal(WhatsAppAIKnowledge.schema.paths.approvedAt.defaultValue, null);
    });

    it('active true on create is ignored by resolveKnowledgeActive for draft', () => {
        assert.equal(resolveKnowledgeActive('draft', true), false);
        assert.equal(resolveKnowledgeActive('pending', true), false);
        assert.equal(resolveKnowledgeActive('rejected', true), false);
        assert.equal(resolveKnowledgeActive('archived', true), false);
        assert.equal(resolveKnowledgeActive('approved', true), true);
        assert.equal(resolveKnowledgeActive('approved', false), false);
    });

    it('non-approved knowledge cannot be active', () => {
        assert.equal(canKnowledgeBeActive('draft'), false);
        assert.equal(canKnowledgeBeActive('pending'), false);
        assert.equal(canKnowledgeBeActive('rejected'), false);
        assert.equal(canKnowledgeBeActive('archived'), false);
        assert.equal(canKnowledgeBeActive('approved'), true);
        const draft = applyKnowledgeActiveSafety({ approvalStatus: 'draft', active: true });
        assert.equal(draft.active, false);
        const approved = applyKnowledgeActiveSafety({ approvalStatus: 'approved', active: true });
        assert.equal(approved.active, true);
    });

    it('knowledge pre-validate forces inactive when not approved', async () => {
        const doc = new WhatsAppAIKnowledge({
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            title: 'Test',
            approvalStatus: 'draft',
            active: true,
        });
        await doc.validate();
        assert.equal(doc.active, false);
    });

    it('customer memory uniqueness is companyId + normalizedMobile', () => {
        const indexes = WhatsAppAICustomerMemory.schema.indexes();
        const hit = indexes.find((entry) => entry[1]?.name === 'uniq_company_normalizedMobile');
        assert.ok(hit);
        assert.equal(hit[1].unique, true);
        assert.equal(hit[0].companyId, 1);
        assert.equal(hit[0].normalizedMobile, 1);
    });

    it('unapproved customer memory cannot validate as approved without approval fields', async () => {
        const bad = new WhatsAppAICustomerMemory({
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            normalizedMobile: '919876543210',
            memoryStatus: 'approved',
        });
        await assert.rejects(() => bad.validate(), /approvedBy and approvedAt/);
        const good = new WhatsAppAICustomerMemory({
            companyId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            normalizedMobile: '919876543210',
            memoryStatus: 'approved',
            approvedBy: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            approvedAt: new Date(),
        });
        await good.validate();
    });

    it('importing all WhatsApp AI models produces no duplicate-index warning', () => {
        const script = "import './src/modules/whatsappAi/models/index.js';\nconsole.log('MODELS_IMPORT_OK');\n";
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
        });
        const combined = (result.stdout || '') + '\n' + (result.stderr || '');
        assert.equal(result.status, 0, combined);
        assert.match(combined, /MODELS_IMPORT_OK/);
        assert.doesNotMatch(combined, /Duplicate schema index/i);
    });
});