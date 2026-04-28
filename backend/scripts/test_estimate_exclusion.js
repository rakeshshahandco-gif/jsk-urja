import 'dotenv/config';
import mongoose from 'mongoose';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import { InvoiceSeries } from '../src/models/invoiceSeries.model.js';
import { generateGSTR1Excel } from '../src/services/gstr1.service.js';
import Customer from '../src/models/customer.model.js';

async function runTest() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!\n');

    try {
        // 1. Create a mock Estimate series if it doesn't exist
        let estimateSeries = await InvoiceSeries.findOne({ documentType: 'Estimate' });
        if (!estimateSeries) {
            estimateSeries = await InvoiceSeries.create({
                seriesName: 'TEST-EST',
                documentType: 'Estimate',
                isEstimate: true,
                gstApplicable: false,
                prefix: 'EST-',
                startNumber: 1,
                financialYear: '2026-2027',
                isActive: true
            });
            console.log('Created test Estimate series.');
        } else {
            console.log('Found existing Estimate series.');
        }

        // 2. Create a test Estimate invoice for the current month
        const customer = await Customer.findOne({});
        const testInvData = {
             invoiceNumber: "EST-TEST-" + Date.now(),
             seriesId: estimateSeries._id,
             invoiceDate: new Date('2026-04-15'), // using April 2026
             customerId: customer._id,
             customerName: customer.customerName || "TEST CUSTOMER",
             customerRegistrationType: "Regular",
             gstType: "CGST/SGST",
             items: [{
                 itemName: "Test Item",
                 qty: 1,
                 rate: 1000,
                 taxableAmount: 1000,
                 uqc: "NOS",
                 hsnCode: "8504",
                 cgstRate: 9,
                 sgstRate: 9,
                 totalAmount: 1180
             }],
             totalTaxableAmount: 1000,
             grandTotal: 1180,
             roundedTotal: 1180,
             status: 'Confirmed'
        };

        const testInvoice = await SalesInvoice.create(testInvData);
        console.log(`Created test Estimate invoice: ${testInvoice.invoiceNumber}`);

        // 3. Generate GSTR-1
        console.log('📊 Generating GSTR-1 Excel for April 2026...');
        const buffer = await generateGSTR1Excel({
            dateFrom: '2026-04-01',
            dateTo: '2026-04-30'
        });
        
        console.log(`\n✅ GSTR-1 Generation successful!`);
        console.log(`Note: Check the output above. If the series filter works, the matched count should be higher than the 'after series filter' count.\n`);

        // 4. Cleanup
        await SalesInvoice.findByIdAndDelete(testInvoice._id);
        console.log(`Cleaned up test Estimate invoice.`);
        
    } catch (err) {
        console.error('❌ Error:', err);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
}

runTest();
