import puppeteer from 'puppeteer';

class PDFService {
    async generatePDF(htmlContent, options = {}) {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            
            // Set content and wait for it to load
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                landscape: options.landscape || false,
                margin: options.margin || { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
            });

            return pdfBuffer;
        } catch (error) {
            console.error('PDF Generation Error:', error);
            throw new Error('Failed to generate PDF');
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}

export default new PDFService();
