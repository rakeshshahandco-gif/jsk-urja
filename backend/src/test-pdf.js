import puppeteer from 'puppeteer';

const htmlContent = '<h1>Test</h1>';

async function test() {
    try {
        const browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent);
        const pdf = await page.pdf({ format: 'A4' });
        console.log("SUCCESS. Length:", pdf.length);
        await browser.close();
    } catch (e) {
        console.error("FAIL:", e);
    }
}
test();
