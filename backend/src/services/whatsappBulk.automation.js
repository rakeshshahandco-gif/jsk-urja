import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

/** Isolated WhatsApp Web automation for bulk utility (separate session from existing module). */
class WhatsAppBulkAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userDataDir = path.join(process.cwd(), '.whatsapp-bulk-session');
    }

    async init() {
        if (this.browser?.isConnected?.()) return { browser: this.browser, page: this.page };
        this.browser = await puppeteer.launch({
            headless: false,
            userDataDir: this.userDataDir,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
            defaultViewport: null,
        });
        const pages = await this.browser.pages();
        this.page = pages.find((p) => p.url().includes('whatsapp.com')) || pages[0] || await this.browser.newPage();
        if (!this.page.url().includes('whatsapp.com')) {
            await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        return { browser: this.browser, page: this.page };
    }

    wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async openChat(phone) {
        const { page } = await this.init();
        await page.bringToFront();
        const clean = String(phone).replace(/\D/g, '');
        const fullPhone = clean.startsWith('91') ? clean : `91${clean}`;
        await page.goto(`https://web.whatsapp.com/send?phone=${fullPhone}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await page.waitForSelector('#pane-side', { timeout: 45000 });
        return page;
    }

    async typeMultiline(page, selector, text) {
        await page.waitForSelector(selector, { timeout: 30000 });
        await page.focus(selector);
        const lines = String(text || '').split('\n');
        for (let i = 0; i < lines.length; i++) {
            await page.type(selector, lines[i]);
            if (i < lines.length - 1) {
                await page.keyboard.down('Shift');
                await page.keyboard.press('Enter');
                await page.keyboard.up('Shift');
            }
        }
    }

    async sendTextMessage(phone, message) {
        const page = await this.openChat(phone);
        const inputSelector = 'footer div[contenteditable="true"]';
        await this.typeMultiline(page, inputSelector, message);
        await this.wait(400);
        await page.keyboard.press('Enter');
        await this.wait(1500);
        return { success: true };
    }

    async sendImageMessage(phone, imagePath, caption = '') {
        if (!imagePath || !fs.existsSync(imagePath)) {
            throw new Error('Image file not found');
        }
        const page = await this.openChat(phone);

        const attachBtn = await page.waitForSelector(
            'span[data-icon="plus"], span[data-icon="attach-menu-plus"], div[title="Attach"]',
            { timeout: 30000 },
        );
        await attachBtn.click();
        await this.wait(600);

        const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 });
        await fileInput.uploadFile(path.resolve(imagePath));

        await page.waitForSelector('span[data-icon="send"]', { timeout: 45000 });
        await this.wait(1200);

        const captionText = String(caption || '').trim();
        if (captionText) {
            const captionSelectors = [
                'div[data-animate-modal-popup="true"] div[contenteditable="true"]',
                'footer div[contenteditable="true"]',
                'div[role="textbox"][contenteditable="true"]',
            ];
            for (const sel of captionSelectors) {
                const box = await page.$(sel);
                if (box) {
                    await box.click();
                    await this.typeMultiline(page, sel, captionText);
                    break;
                }
            }
            await this.wait(400);
        }

        const sendBtn = await page.$('span[data-icon="send"]');
        if (!sendBtn) throw new Error('WhatsApp send button not found after image preview');
        await sendBtn.click();
        await this.wait(2000);
        return { success: true };
    }

    /** @deprecated use sendImageMessage — kept for callers that still reference it */
    async sendWithAttachment(phone, message, attachmentPath) {
        return this.sendImageMessage(phone, attachmentPath, message);
    }
}

const whatsappBulkAutomation = new WhatsAppBulkAutomation();
export default whatsappBulkAutomation;
