/**
 * Phase 1B-1 frontend static checks for inbound dry-run test panel.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WHATSAPP_AI_PERMISSIONS } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsPage = fs.readFileSync(path.join(__dirname, 'pages', 'WhatsAppAISettingsPage.jsx'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'whatsappAiApi.js'), 'utf8');

describe('whatsappAi phase1b1 frontend inbound test panel', () => {
  it('permission-gated test panel', () => {
    assert.equal(WHATSAPP_AI_PERMISSIONS.TESTING_INBOUND, 'whatsapp_ai.testing.inbound');
    assert.match(settingsPage, /TESTING_INBOUND/);
    assert.match(settingsPage, /canTestInbound/);
    assert.match(settingsPage, /data-whatsapp-ai-inbound-test/);
  });

  it('warning text present', () => {
    assert.match(settingsPage, /TEST \/ DRY-RUN ONLY/);
    assert.match(settingsPage, /No WhatsApp message will be sent/);
    assert.match(settingsPage, /No AI provider will be called/);
    assert.match(settingsPage, /No lead will be created/);
  });

  it('request payload fields', () => {
    assert.match(settingsPage, /externalMessageId/);
    assert.match(settingsPage, /messageType: 'text'/);
    assert.match(api, /internal\/test-inbound/);
    assert.match(api, /testInbound:/);
  });

  it('result display', () => {
    assert.match(settingsPage, /JSON\.stringify\(testResult/);
    assert.match(settingsPage, /setTestResult/);
  });

  it('no live send or AI wording that claims action', () => {
    assert.doesNotMatch(settingsPage, /Send WhatsApp|Call OpenAI|Promote lead/i);
    assert.doesNotMatch(api, /baileys|openai|socket\.io/i);
  });
});
