/** Phase 1A-4 frontend static checks. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FEATURE_SETTINGS, isFeatureEnabled } from '../../utils/featureSettings.js';
import { WHATSAPP_AI_FEATURE, WHATSAPP_AI_PERMISSIONS, ZERO_DASHBOARD, confidenceTone } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..', '..');
const featureDir = __dirname;
const apiFile = path.join(root, 'src', 'services', 'whatsappAiApi.js');
const appFile = path.join(root, 'src', 'App.jsx');
const pathsFile = path.join(root, 'src', 'routes', 'paths.js');
const menuFile = path.join(root, 'src', 'config', 'menu.config.js');
const menuMapFile = path.join(root, 'src', 'config', 'menuFeatureMap.js');
const fieldsFile = path.join(root, 'src', 'config', 'featureSettingsFields.js');
const permsFile = path.join(root, 'src', 'utils', 'permissions.js');

const TEN = [
  '/communication/whatsapp-ai',
  '/communication/whatsapp-ai/inbox',
  '/communication/whatsapp-ai/active',
  '/communication/whatsapp-ai/waiting-human',
  '/communication/whatsapp-ai/lead-drafts',
  '/communication/whatsapp-ai/knowledge',
  '/communication/whatsapp-ai/documents',
  '/communication/whatsapp-ai/rules',
  '/communication/whatsapp-ai/settings',
  '/communication/whatsapp-ai/audit',
];

function collectJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full));
    else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

describe('whatsappAi phase1a4 frontend registration', () => {
  it('1-2. feature flag registered and defaults false', () => {
    assert.equal(WHATSAPP_AI_FEATURE, 'communication.whatsappAiEnabled');
    assert.equal(DEFAULT_FEATURE_SETTINGS.communication.whatsappAiEnabled, false);
    assert.equal(isFeatureEnabled(DEFAULT_FEATURE_SETTINGS, WHATSAPP_AI_FEATURE), false);
    assert.equal(isFeatureEnabled({}, WHATSAPP_AI_FEATURE), false);
    assert.equal(isFeatureEnabled({ communication: {} }, WHATSAPP_AI_FEATURE), false);
    assert.match(fs.readFileSync(fieldsFile, 'utf8'), /whatsappAiEnabled/);
    assert.equal(DEFAULT_FEATURE_SETTINGS.communication.enableWhatsappBulk, false);
  });

  it('3-5. menu feature gating simulation', () => {
    const menu = fs.readFileSync(menuFile, 'utf8');
    const map = fs.readFileSync(menuMapFile, 'utf8');
    assert.match(menu, /communication-whatsapp-ai-group/);
    assert.match(menu, /title: 'WhatsApp AI'/);
    assert.match(map, /communication-whatsapp-ai-dashboard.: .communication.whatsappAiEnabled/);
    const vis = (on, perm) => Boolean(on && perm);
    assert.equal(vis(false, true), false);
    assert.equal(vis(true, false), false);
    assert.equal(vis(true, true), true);
    assert.match(menu, /id: 'whatsapp-chat'/);
    assert.match(menu, /id: 'communication-bulk-campaigns'/);
  });

  it('6-7. ten routes with guards', () => {
    const pathsSrc = fs.readFileSync(pathsFile, 'utf8');
    const app = fs.readFileSync(appFile, 'utf8');
    assert.equal(TEN.length, 10);
    for (const p of TEN) assert.ok(pathsSrc.includes("'" + p + "'"), p);
    assert.ok(app.includes('WhatsAppAiFeatureGuard'));
    assert.match(app, /WhatsAppAiFeatureGuard/);
    assert.doesNotMatch(app, /FeatureGuard feature=\{WHATSAPP_AI_FEATURE\}/);
    for (const name of ['WhatsAppAIDashboardPage','WhatsAppAIInboxPage','WhatsAppAIActiveConversationsPage','WhatsAppAIWaitingHumanPage','WhatsAppAILeadDraftsPage','WhatsAppAIKnowledgePage','WhatsAppAIDocumentsPage','WhatsAppAIRulesPage','WhatsAppAISettingsPage','WhatsAppAIAuditLogsPage']) {
      assert.ok(app.includes(name), name);
    }
    assert.ok(app.includes('WhatsAppAiAnyPermission'));
  });

  it('8-10. existing WhatsApp routes unchanged', () => {
    const app = fs.readFileSync(appFile, 'utf8');
    assert.match(app, /path="\/whatsapp\/chat"/);
    assert.match(app, /WhatsAppSettingsPage/);
    assert.match(app, /enableWhatsappBulk/);
    assert.match(app, /WhatsappBulkCampaignsPage/);
  });

  it('11-12. dashboard zero / no poll', () => {
    assert.equal(ZERO_DASHBOARD.conversationsToday, 0);
    assert.equal(ZERO_DASHBOARD.liveProcessingEnabled, false);
    const dash = fs.readFileSync(path.join(featureDir, 'pages', 'WhatsAppAIDashboardPage.jsx'), 'utf8');
    assert.match(dash, /dashboardSummary/);
    assert.doesNotMatch(dash, /setInterval|socket\.on/);
    assert.match(dash, /One-shot load only/);
  });

  it('13. API client safety', () => {
    const src = fs.readFileSync(apiFile, 'utf8');
    assert.match(src, /from '\.\/api'/);
    assert.doesNotMatch(src, /sendMessage|sendDocument|promote|webhook/i);
    assert.ok(!/inbound/i.test(src) || /test-inbound/i.test(src));
    assert.doesNotMatch(src, /localhost|onrender\.com|baileys|whatsapp\.service/i);
    assert.match(src, /activateKnowledge/);
    assert.match(src, /dashboardSummary/);
  });

  it('14. settings UI safety', () => {
    const src = fs.readFileSync(path.join(featureDir, 'pages', 'WhatsAppAISettingsPage.jsx'), 'utf8');
    assert.doesNotMatch(src, /openaiApiKey|mongoUri|type=['"]password['"]/i);
    assert.ok(!src.includes('name="apiKey"'));
    assert.match(src, /SAFE_KEYS/);
  });

  it('15. knowledge draft inactive', () => {
    const src = fs.readFileSync(path.join(featureDir, 'pages', 'WhatsAppAIKnowledgePage.jsx'), 'utf8');
    assert.match(src, /approvalStatus:\s*'draft'/);
    assert.match(src, /active:\s*false/);
    assert.match(src, /activateKnowledge/);
  });

  it('16. confidence thresholds', () => {
    assert.equal(confidenceTone(80), 'green');
    assert.equal(confidenceTone(60), 'yellow');
    assert.equal(confidenceTone(59), 'red');
    assert.equal(confidenceTone(null), 'neutral');
  });

  it('17-18. no baileys/sockets', () => {
    const combined = collectJs(featureDir).concat([apiFile]).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(combined, /@whiskeysockets\/baileys/);
    assert.doesNotMatch(combined, /whatsapp\.service/);
    assert.doesNotMatch(combined, /socket\.on|messages\.upsert|sendRawToJid/);
  });

  it('19. permissions registered', () => {
    const perms = fs.readFileSync(permsFile, 'utf8');
    assert.match(perms, /id: 'whatsapp_ai'/);
    assert.equal(Object.keys(WHATSAPP_AI_PERMISSIONS).length, 16);
    for (const key of Object.values(WHATSAPP_AI_PERMISSIONS)) {
      assert.ok(key.startsWith('whatsapp_ai.'));
    }
  });

  it('20. responsive overflow', () => {
    const shell = fs.readFileSync(path.join(featureDir, 'components', 'WhatsAppAiPageShell.jsx'), 'utf8');
    assert.match(shell, /overflowX:\s*'hidden'/);
  });
});
