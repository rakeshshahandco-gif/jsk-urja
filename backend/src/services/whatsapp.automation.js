import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

class WhatsAppAutomationService {
    constructor() {
        this.browser = null;
        this.userDataDir = path.join(process.cwd(), '.whatsapp-session');
    }

    async init() {
        if (!this.browser || !this.browser.connected) {
            this.browser = await puppeteer.launch({
                headless: false,
                userDataDir: this.userDataDir,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sendDocument(options) {
        const { phone, groupName, filePath, caption, onStatusUpdate, delays = {} } = options;
        const browser = await this.init();
        const page = await browser.newPage();
        
        try {
            const update = (status) => onStatusUpdate && onStatusUpdate(status);

            // 1. Navigate
            update('Opening WhatsApp');
            if (phone && !groupName) {
                const cleanPhone = phone.replace(/\D/g, '');
                await page.goto(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(caption)}`, { waitUntil: 'networkidle2' });
            } else {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
            }

            // 2. Wait for login / main interface
            try {
                await page.waitForSelector('#pane-side', { timeout: 60000 });
            } catch (e) {
                throw new Error('Please login to WhatsApp Web first.');
            }

            // 3. Select Target (Automated or Manual)
            if (groupName) {
                update(`Searching for "${groupName}"...`);
                const searchBoxSelector = 'div[contenteditable="true"][data-tab="3"]';
                await page.waitForSelector(searchBoxSelector);
                await page.click(searchBoxSelector);
                await page.type(searchBoxSelector, groupName);
                await this.wait(delays.searchDelay || 2000);

                const resultSelector = `span[title="${groupName}"]`;
                try {
                    await page.waitForSelector(resultSelector, { timeout: 10000 });
                    await page.click(resultSelector);
                    update('Group Selected');
                } catch (e) {
                    throw new Error(`Group "${groupName}" not found.`);
                }
            } else if (!phone) {
                // Interactive Mode: Wait for user to click a chat
                update('Please select a group/chat in WhatsApp...');
                // We wait for the chat header or the input box to appear
                await page.waitForSelector('footer div[contenteditable="true"]', { timeout: 120000 });
                update('Chat Detected');
            } else {
                // Phone mode - wait for chat to load from URL params
                update('Opening Chat...');
                await page.waitForSelector('footer div[contenteditable="true"]', { timeout: 30000 });
            }

            // 4. Attach File
            update('Attaching PDF...');
            await this.wait(1000); // Small pause for stability
            
            // Look for the "Plus" icon or "Attach" button
            const plusButton = 'span[data-icon="plus"]';
            const attachButton = 'span[data-icon="attach-menu-plus"]'; // Newer version sometimes use this
            
            let attachBtnSelector = plusButton;
            try {
                await page.waitForSelector(plusButton, { timeout: 5000 });
            } catch(e) {
                try {
                    await page.waitForSelector(attachButton, { timeout: 5000 });
                    attachBtnSelector = attachButton;
                } catch(e2) {
                    throw new Error('Could not find attach button.');
                }
            }

            await page.click(attachBtnSelector);
            const fileInputSelector = 'input[type="file"]';
            await page.waitForSelector(fileInputSelector);
            const input = await page.$(fileInputSelector);
            await input.uploadFile(filePath);
            
            await this.wait(delays.attachDelay || 3000);

            // 5. Caption and Send
            update('Ready to Send');
            const captionSelector = 'div[contenteditable="true"][data-tab="10"]';
            try {
                await page.waitForSelector(captionSelector, { timeout: 5000 });
                // Only type if caption is provided and field is empty or needs it
                if (caption) {
                    await page.type(captionSelector, caption);
                }
            } catch (e) {
                // Ignore if not found or already filled
            }

            // Optional: Auto-click send if instructed or if phone mode
            if (phone || groupName) {
                update('Sending...');
                await page.waitForSelector('span[data-icon="send"]', { timeout: 10000 });
                await page.click('span[data-icon="send"]');
                await this.wait(delays.sendDelay || 2000);
                update('Sent Successfully');
            } else {
                update('File attached! Please click send manually.');
                // In interactive mode, we might want to leave the page open briefly
                await this.wait(5000);
            }

            return { success: true };
        } catch (error) {
            console.error('WhatsApp Automation Error:', error);
            throw error;
        } finally {
            // In manual mode, maybe we don't want to close immediately?
            // But Puppeteer usually should close or it hangs the process.
            // We'll close after a short delay so user sees success.
            if (!phone && !groupName) await this.wait(5000); 
            await page.close();
        }
    }
}

export default new WhatsAppAutomationService();
