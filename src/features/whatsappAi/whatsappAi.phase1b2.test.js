/**
 * Phase 1B-2 frontend static checks for dry-run draft panel.
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

describe('whatsappAi phase1b2 frontend draft panel', () => {
  it('permission gating', () => {
    assert.equal(WHATSAPP_AI_PERMISSIONS.TESTING_GENERATE_DRAFT, 'whatsapp_ai.testing.generate_draft');
    assert.match(settingsPage, /canGenerateDraft/);
    assert.match(settingsPage, /data-whatsapp-ai-draft-test/);
  });

  it('dry-run warning', () => {
    assert.match(settingsPage, /Dry-run only\. No AI provider called\. Nothing was sent to WhatsApp\./);
  });

  it('generate then fetch draft detail', () => {
    assert.match(api, /testGenerateDraft/);
    assert.match(api, /getTestDraft/);
    assert.match(api, /test-generate-draft/);
    assert.match(api, /test-drafts/);
    assert.match(settingsPage, /testGenerateDraft/);
    assert.match(settingsPage, /getTestDraft/);
  });

  it('shows intent and pending review', () => {
    assert.match(settingsPage, /Generate Test Draft/);
    assert.match(settingsPage, /draftDetail\.intent/);
    assert.match(settingsPage, /pending_review/);
  });
});
