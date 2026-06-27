import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const htmlPath = path.join(root, 'docs', 'CRM_Setup_Guide.html');
const pdfPath = path.join(root, 'docs', 'CRM_Setup_Guide.pdf');
const desktopPdf = path.join(process.env.USERPROFILE || '', 'Desktop', 'CRM_Setup_Guide.pdf');
const desktopHtml = path.join(process.env.USERPROFILE || '', 'Desktop', 'CRM_Setup_Guide.html');

if (!fs.existsSync(htmlPath)) {
    console.error('Missing HTML:', htmlPath);
    process.exit(1);
}

const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
try {
    const page = await browser.newPage();
    const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 120000 });
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '10mm', bottom: '12mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: false,
        tagged: false,
    });

    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.copyFileSync(pdfPath, desktopPdf);
    fs.copyFileSync(htmlPath, desktopHtml);

    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    const sizeKb = Math.round(pdfBuffer.length / 1024);
    console.log('PDF created:', pdfPath);
    console.log('Desktop copy:', desktopPdf);
    console.log('HTML copy:', desktopHtml);
    console.log('Valid header:', header, '| Size KB:', sizeKb);
} finally {
    await browser.close();
}
