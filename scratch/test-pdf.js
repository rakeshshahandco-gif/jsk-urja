import puppeteer from 'puppeteer';

async function test() {
    console.log("Launching browser...");
    try {
        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        console.log("Browser launched.");
        const page = await browser.newPage();
        await page.setContent('<h1>Hello World</h1>');
        const pdf = await page.pdf({ format: 'A4' });
        console.log("PDF generated. Length:", pdf.length);
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
