/**
 * Phase 1C.1 — JSK Product Intelligence Engine tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
    JSK_PRODUCT_FAMILIES,
    JSK_PRODUCT_ALIASES,
    analyzeProductIntelligence,
    productIntelligenceToEntityMap,
    JSK_PRODUCT_INTELLIGENCE_VERSION,
    createAiBrain,
    createEntityExtractor,
} from '../src/modules/whatsappAi/services/brain/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piDir = path.join(__dirname, '..', 'src', 'modules', 'whatsappAi', 'services', 'brain', 'productIntelligence');

function makeMem(text) {
    const companyId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const conversationId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const messageId = 'cccccccccccccccccccccccc';
    const conversations = [{
        _id: conversationId,
        companyId,
        normalizedMobile: '919876543210',
        source: 'internal_test',
        preferredLanguage: 'en',
        customerId: null,
        leadId: null,
        assignedUserId: null,
        isDeleted: false,
    }];
    const messages = [{
        _id: messageId,
        companyId,
        conversationId,
        direction: 'in',
        messageType: 'text',
        text,
        createdAt: new Date(),
        isDeleted: false,
    }];
    const Conversation = {
        async findOne(filter) {
            return conversations.find((c) =>
                String(c._id) === String(filter._id)
                && String(c.companyId) === String(filter.companyId)
                && c.isDeleted === false) || null;
        },
    };
    const Message = {
        find(filter) {
            const rows = messages.filter((m) =>
                String(m.companyId) === String(filter.companyId)
                && String(m.conversationId) === String(filter.conversationId)
                && m.isDeleted === false);
            const api = {
                sort() { return api; },
                limit() { return api; },
                lean() { return Promise.resolve(rows); },
                then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
            };
            return api;
        },
    };
    return { companyId, conversationId, messageId, deps: { Conversation, Message } };
}

describe('whatsappAi phase1c1 product intelligence', () => {
    it('taxonomy and aliases are present', () => {
        assert.ok(JSK_PRODUCT_FAMILIES.some((f) => f.id === 'dali_driver'));
        assert.ok(JSK_PRODUCT_FAMILIES.some((f) => f.id === 'scene_controller'));
        assert.ok(JSK_PRODUCT_ALIASES.length >= 10);
        assert.equal(JSK_PRODUCT_INTELLIGENCE_VERSION, 'jsk_product_intelligence_v1');
    });

    it('extracts DALI DT8 electrical + quantity with confidence', () => {
        const pi = analyzeProductIntelligence('Need 10 pcs DALI Driver 40W 220V DT8');
        assert.equal(pi.productFamily.id, 'dali_driver');
        assert.equal(pi.productFamily.label, 'DALI Driver');
        assert.equal(pi.quantity.value, 10);
        assert.equal(pi.electrical.wattage.value, 40);
        assert.equal(pi.electrical.voltage.value, 220);
        assert.equal(pi.protocols.dali, true);
        assert.equal(pi.protocols.dt8, true);
        assert.ok(pi.confidence.overall > 0.5);
        assert.ok(pi.aliasesMatched.some((a) => a.familyId === 'dali_driver'));
    });

    it('recognises BLE Mesh, Zigbee, Phase Cut, Smart Switch, Scene Controller', () => {
        assert.equal(analyzeProductIntelligence('BLE Mesh Driver quote').productFamily.id, 'ble_mesh_driver');
        assert.equal(analyzeProductIntelligence('zigbee driver 30W').productFamily.id, 'zigbee_driver');
        assert.equal(analyzeProductIntelligence('phase cut driver needed').productFamily.id, 'phase_cut_driver');
        assert.equal(analyzeProductIntelligence('smart switch wi-fi').productFamily.id, 'smart_switch');
        assert.equal(analyzeProductIntelligence('scene controller for lobby').productFamily.id, 'scene_controller');
    });

    it('protocol extraction covers DT6/DT8/BLE Mesh/Zigbee/Wi-Fi', () => {
        const pi = analyzeProductIntelligence('DT6 and DT8 with BLE Mesh and Zigbee and Wi-Fi');
        assert.equal(pi.protocols.dt6, true);
        assert.equal(pi.protocols.dt8, true);
        assert.equal(pi.protocols.bleMesh, true);
        assert.equal(pi.protocols.zigbee, true);
        assert.equal(pi.protocols.wifi, true);
        assert.ok(pi.protocols.list.includes('ble_mesh'));
    });

    it('language detection: Gujarati, Hindi, English, mixed', () => {
        assert.equal(analyzeProductIntelligence('નમસ્તે કિંમત કેટલી').language.code, 'gu');
        assert.equal(analyzeProductIntelligence('नमस्ते कीमत बताओ').language.code, 'hi');
        assert.equal(analyzeProductIntelligence('Hello price please').language.primaryCode, 'en');
        const mixed = analyzeProductIntelligence('Hello નમસ્તે DALI driver');
        assert.ok(['mixed', 'gu', 'en'].includes(mixed.language.code));
        assert.ok(mixed.language.confidence > 0);
    });

    it('maps to entity map without breaking 1C.0 keys', () => {
        const pi = analyzeProductIntelligence('5 pcs Phase Cut Driver 20W');
        const entities = productIntelligenceToEntityMap(pi);
        assert.equal(entities.productName, 'Phase Cut Driver');
        assert.equal(entities.quantity, 5);
        assert.equal(entities.wattage, 20);
        assert.equal(entities.productFamilyId, 'phase_cut_driver');
        const viaExtractor = createEntityExtractor().extract('5 pcs Phase Cut Driver 20W');
        assert.equal(viaExtractor.productName, 'Phase Cut Driver');
    });

    it('brain result includes productIntelligence enrichment', async () => {
        const mem = makeMem('Need 2 pcs Zigbee Driver 15W DT6');
        const brain = createAiBrain({ deps: mem.deps });
        const result = await brain.run({
            companyId: mem.companyId,
            conversationId: mem.conversationId,
            sourceMessageId: mem.messageId,
        });
        assert.ok(result.productIntelligence);
        assert.equal(result.productIntelligence.version, JSK_PRODUCT_INTELLIGENCE_VERSION);
        assert.equal(result.productIntelligence.productFamily.id, 'zigbee_driver');
        assert.equal(result.entities.productName, 'Zigbee Driver');
        assert.equal(result.outboundSent, false);
        assert.equal(result.networkCalled, false);
        assert.equal(result.leadCreated, false);
    });

    it('no network/SDK/DB writes in product intelligence sources', () => {
        for (const name of fs.readdirSync(piDir)) {
            if (!name.endsWith('.js')) continue;
            const t = fs.readFileSync(path.join(piDir, name), 'utf8');
            assert.equal(t.includes('fetch('), false, name);
            assert.equal(t.toLowerCase().includes('openai'), false, name);
            assert.equal(t.includes('mongoose'), false, name);
            assert.equal(t.includes('.save('), false, name);
        }
    });
});
