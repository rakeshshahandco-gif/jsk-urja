import puppeteer from 'puppeteer';

const bom = {
    bomNumber: 'TEST-BOM-001',
    finishedProductId: { itemName: 'Test Product', itemCode: 'TP-001', uom: 'NOS' },
    bomType: 'Production',
    revisionDate: new Date(),
    productionQuantity: 10,
    status: 'Approved',
    version: 'V1',
    isDefault: true,
    components: [
        { itemName: 'Comp 1', itemCode: 'C1', componentType: 'SMD', quantity: 5, uom: 'NOS', rate: 10, totalCost: 50, points: 2, remarks: 'R1' }
    ],
    remarks: 'Test remarks',
    processes: { soldering: true, assembly: true },
    totalRawMaterialCost: 50,
    totalPointsLabourCost: 20,
    totalProcessCost: 5,
    overheadCost: 2,
    labourCost: 3,
    finalProductionCostPerUnit: 8
};

const company = {
    companyName: 'JSK TECH TEST',
    address: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    email: 'test@example.com',
    phone: '1234567890',
    gstNumber: '24AAAAA0000A1Z5'
};

async function test() {
    console.log("Generating HTML...");
    const includeCost = true;
    const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateFmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : "—";
    
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; background: red; }
                h1 { color: white; }
            </style>
        </head>
        <body>
            <div class="page">
                <h1>BOM TEST</h1>
                <p>Number: ${bom.bomNumber}</p>
            </div>
        </body>
        </html>
    `;

    console.log("Launching browser...");
    try {
        const browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        console.log("Browser launched.");
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        console.log("Content set.");
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        console.log("PDF generated. Length:", pdf.length);
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
