import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

class WhatsAppAutomationService {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userDataDir = path.join(process.cwd(), '.whatsapp-session');
    }

    async init() {
        if (!this.browser || !this.browser.connected) {
            this.browser = await puppeteer.launch({
                headless: false,
                userDataDir: this.userDataDir,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
                defaultViewport: null,
            });
        }
        
        if (!this.page || this.page.isClosed()) {
            const pages = await this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();
        }
        
        return { browser: this.browser, page: this.page };
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async disconnect() {
        if (this.browser && this.browser.connected) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // ── One-time setup: open WhatsApp Web and wait for QR scan ────────────────
    async connectAndWaitForLogin() {
        const browser = await this.init();
        const pages = await browser.pages();
        let page = pages[0] || await browser.newPage();

        await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });

        // Check if already logged in
        try {
            await page.waitForSelector('#pane-side', { timeout: 8000 });
            return 'Already connected! WhatsApp Web is logged in.';
        } catch (_) {
            // Not logged in yet, wait for QR scan (up to 90 seconds)
        }

        try {
            // Wait for QR code to appear
            await page.waitForSelector('canvas', { timeout: 15000 });
        } catch (_) {
            // QR might already be showing
        }

        // Now wait up to 90 seconds for the user to scan the QR code
        try {
            await page.waitForSelector('#pane-side', { timeout: 90000 });
            await this.wait(2000);
            // Minimize but don't close - let session persist
            return 'WhatsApp connected successfully! You can now close the browser window.';
        } catch (e) {
            throw new Error('QR code scan timed out after 90 seconds. Please try again.');
        }
    }

    async sendDocument(options) {
        const { phone, groupName, filePath, caption, onStatusUpdate, delays = {} } = options;
        const { page } = await this.init();

        try {
            await page.bringToFront();
            const update = (status) => onStatusUpdate && onStatusUpdate(status);

            // 1. Navigate
            update('Opening WhatsApp Web...');
            if (phone && !groupName) {
                const cleanPhone = phone.replace(/\D/g, '');
                const fullPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
                await page.goto(`https://web.whatsapp.com/send?phone=${fullPhone}`, { waitUntil: 'networkidle2' });
            } else {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
            }

            // 2. Wait for main interface (must be logged in)
            try {
                await page.waitForSelector('#pane-side', { timeout: 30000 });
            } catch (e) {
                throw new Error('WhatsApp is not logged in. Please go to Settings → WhatsApp → Connect WhatsApp and scan the QR code first.');
            }

            // 3. Select Target
            if (groupName) {
                update(`Searching for group "${groupName}"...`);
                const searchBoxSelector = 'div[contenteditable="true"][data-tab="3"]';
                await page.waitForSelector(searchBoxSelector, { timeout: 10000 });
                await page.click(searchBoxSelector);
                await page.type(searchBoxSelector, groupName);
                await this.wait(delays.searchDelay || 2500);

                // Try to find the group result
                let found = false;
                const selectors = [
                    `span[title="${groupName}"]`,
                    `[data-testid="cell-frame-title"] span[title="${groupName}"]`,
                ];
                for (const sel of selectors) {
                    try {
                        await page.waitForSelector(sel, { timeout: 8000 });
                        await page.click(sel);
                        found = true;
                        update('Group selected!');
                        break;
                    } catch (_) { /* try next */ }
                }
                if (!found) {
                    throw new Error(`WhatsApp group "${groupName}" not found. Please check the exact group name.`);
                }
            } else if (phone) {
                // Phone mode - wait for the chat to load from URL parameter
                update('Opening chat...');
                await page.waitForSelector('footer div[contenteditable="true"]', { timeout: 20000 });
            }

            // 4. Attach File
            update('Attaching PDF...');
            await this.wait(1500);

            // Look for the attach/clip button
            let attachBtnSelector;
            const attachSelectors = [
                'span[data-icon="plus"]',
                'span[data-icon="attach-menu-plus"]',
                'span[data-icon="clip"]',
            ];
            for (const sel of attachSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 4000 });
                    attachBtnSelector = sel;
                    break;
                } catch (_) { /* try next */ }
            }

            if (!attachBtnSelector) throw new Error('Could not find the attach button. WhatsApp Web layout may have changed.');

            await page.click(attachBtnSelector);
            await this.wait(500);

            // Upload the file
            const fileInputSelector = 'input[type="file"]';
            await page.waitForSelector(fileInputSelector, { timeout: 5000 });
            const input = await page.$(fileInputSelector);
            await input.uploadFile(filePath);
            await this.wait(delays.attachDelay || 3000);

            // 5. Add caption
            update('Sending...');
            const captionSelector = 'div[contenteditable="true"][data-tab="10"]';
            try {
                await page.waitForSelector(captionSelector, { timeout: 5000 });
                if (caption) await page.type(captionSelector, caption);
            } catch (_) { /* no caption field, OK */ }

            // 6. Send
            const sendSelectors = ['span[data-icon="send"]', 'button[data-testid="compose-btn-send"]'];
            let sent = false;
            for (const sel of sendSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 6000 });
                    await page.click(sel);
                    sent = true;
                    break;
                } catch (_) { /* try next */ }
            }

            if (!sent) throw new Error('Could not find the send button. Please check WhatsApp Web.');

            await this.wait(delays.sendDelay || 2000);
            update('Sent successfully!');

            return { success: true };
        } catch (error) {
            console.error('WhatsApp Automation Error:', error.message);
            throw error;
        } finally {
            // DO NOT CLOSE - Keep session alive as requested
        }
    }

    async getChats() {
        const { page } = await this.init();
        try {
            await page.bringToFront();
            if (page.url() !== 'https://web.whatsapp.com/') {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
            }
            // Wait for main interface
            try {
                await page.waitForSelector('#pane-side', { timeout: 30000 });
            } catch (e) {
                throw new Error('WhatsApp is not logged in. Please go to Settings → WhatsApp → Connect WhatsApp and scan the QR code first.');
            }

            // Scroll a bit to load more chats
            await page.evaluate(() => {
                const pane = document.querySelector('#pane-side');
                if (pane) pane.scrollTop += 500;
            });
            await this.wait(1000);

            // Extract chat titles
            const chatTitles = await page.evaluate(() => {
                const results = [];
                const spanTitles = document.querySelectorAll('#pane-side span[title]');
                spanTitles.forEach(s => {
                    const title = s.getAttribute('title');
                    if (title && !results.includes(title)) {
                        results.push(title);
                    }
                });
                return results;
            });

            return chatTitles;
        } finally {
            // Keep open
        }
    }

    async sendMessage(options) {
        const { phone, groupName, message, onStatusUpdate, delays = {} } = options;
        const { page } = await this.init();

        try {
            await page.bringToFront();
            const update = (status) => onStatusUpdate && onStatusUpdate(status);

            // 1. Navigate
            update('Opening WhatsApp Web...');
            if (phone && !groupName) {
                const cleanPhone = phone.replace(/\D/g, '');
                const fullPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
                await page.goto(`https://web.whatsapp.com/send?phone=${fullPhone}`, { waitUntil: 'networkidle2' });
            } else {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
            }

            // 2. Wait for main interface
            try {
                await page.waitForSelector('#pane-side', { timeout: 30000 });
            } catch (e) {
                throw new Error('WhatsApp is not logged in.');
            }

            // 3. Select Target
            if (groupName) {
                update(`Searching for "${groupName}"...`);
                const searchBoxSelector = 'div[contenteditable="true"][data-tab="3"]';
                await page.waitForSelector(searchBoxSelector, { timeout: 10000 });
                await page.click(searchBoxSelector);
                // Clear existing text if any (triple click + backspace)
                await page.click(searchBoxSelector, { clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.type(searchBoxSelector, groupName);
                await this.wait(delays.searchDelay || 2500);

                let found = false;
                const selectors = [
                    `span[title="${groupName}"]`,
                    `[data-testid="cell-frame-title"] span[title="${groupName}"]`,
                ];
                for (const sel of selectors) {
                    try {
                        await page.waitForSelector(sel, { timeout: 8000 });
                        await page.click(sel);
                        found = true;
                        update('Selected!');
                        break;
                    } catch (_) { }
                }
                if (!found) throw new Error(`Group/Chat "${groupName}" not found.`);
            } else if (phone) {
                update('Opening chat...');
                await page.waitForSelector('footer div[contenteditable="true"]', { timeout: 20000 });
            }

            // 4. Send Message
            update('Sending message...');
            const inputSelector = 'footer div[contenteditable="true"]';
            await page.waitForSelector(inputSelector, { timeout: 10000 });
            await page.focus(inputSelector);
            
            // Type message - handle newlines
            const lines = message.split('\n');
            for (let i = 0; i < lines.length; i++) {
                await page.type(inputSelector, lines[i]);
                if (i < lines.length - 1) {
                    await page.keyboard.down('Shift');
                    await page.keyboard.press('Enter');
                    await page.keyboard.up('Shift');
                }
            }
            await this.wait(500);
            await page.keyboard.press('Enter');
            await this.wait(delays.sendDelay || 2000);
            update('Sent successfully!');

            return { success: true };
        } finally {
            // Keep open
        }
    }
}

export default new WhatsAppAutomationService();
