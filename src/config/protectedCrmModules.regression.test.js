/**
 * Frontend protected WhatsApp module registration (Node test; no browser).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

describe('Frontend protected WhatsApp modules', () => {
    it('exports protected registry with three WhatsApp keys', () => {
        const src = fs.readFileSync(path.join(root, 'src/config/protectedCrmModules.js'), 'utf8');
        assert.ok(src.includes('whatsapp_communication'));
        assert.ok(src.includes('whatsapp_ai'));
        assert.ok(src.includes('whatsapp_settings'));
        assert.ok(src.includes('protectedFromAccidentalRemoval: true'));
    });

    it('menu + feature map + module map stay aligned for WhatsApp', () => {
        const menu = fs.readFileSync(path.join(root, 'src/config/menu.config.js'), 'utf8');
        const feat = fs.readFileSync(path.join(root, 'src/config/menuFeatureMap.js'), 'utf8');
        const mods = fs.readFileSync(path.join(root, 'src/config/menuModuleMap.js'), 'utf8');
        assert.ok(menu.includes("id: 'whatsapp-root'"));
        assert.ok(menu.includes("title: 'WhatsApp Communication'"));
        assert.ok(menu.includes("title: 'WhatsApp AI'"));
        assert.ok(menu.includes("title: 'WhatsApp Settings'"));
        assert.ok(feat.includes("communication.whatsappAiEnabled"));
        assert.ok(feat.includes("communication.enableWhatsappBulk"));
        assert.ok(mods.includes("code: 'whatsapp_ai'"));
        assert.ok(mods.includes("'/communication/whatsapp-ai', 'whatsapp_ai'"));
    });

    it('App.jsx still registers WhatsApp Communication and AI routes (no rebuild wipe)', () => {
        const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
        assert.ok(app.includes('path="/whatsapp"'));
        assert.ok(app.includes('path="/whatsapp/chat"'));
        assert.ok(app.includes('WHATSAPP_AI.DASHBOARD'));
        assert.ok(app.includes('WHATSAPP_BULK.CAMPAIGNS'));
    });

    it('sidebar expands WhatsApp group inline (children actually render)', () => {
        const sidebarItem = fs.readFileSync(path.join(root, 'src/components/layout/Sidebar/SidebarItem.jsx'), 'utf8');
        assert.ok(
            sidebarItem.includes("item.id === 'whatsapp-root'"),
            'whatsapp-root must be in inlineTopLevelGroup or children stay hidden',
        );
        const menu = fs.readFileSync(path.join(root, 'src/config/menu.config.js'), 'utf8');
        const messengerAt = menu.indexOf("id: 'messenger'");
        const whatsappAt = menu.indexOf("id: 'whatsapp-root'");
        const salesAt = menu.indexOf("id: 'sales'");
        assert.ok(messengerAt > -1 && whatsappAt > messengerAt && whatsappAt < salesAt, 'WhatsApp must sit between Messenger and Sales');
    });
});
