import 'dotenv/config';
import mongoose from 'mongoose';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import Customer from '../src/models/customer.model.js';
import { getMissingPosPreview, syncMissingPos } from '../src/controllers/gstReport.controller.js';

async function testUtility() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!\n');

    try {
        // 1. Setup Dummy Data
        console.log('📝 Setting up dummy customer & invoice...');
        
        // Find an existing active customer
        const customer = await Customer.findOne({ gstNumber: { $regex: '^07' } });
        if (!customer) throw new Error("Need a customer with 07 GSTIN to test");
        
        const dummyInvoiceNumber = 'TEST-DUMMY-001';
        
        // Clean up any old run
        await SalesInvoice.deleteMany({ invoiceNumber: dummyInvoiceNumber });
        
        // Insert new dummy
        const dummyInvoice = await SalesInvoice.create({
            invoiceNumber: dummyInvoiceNumber,
            invoiceDate: new Date(),
            customerId: customer._id,
            customerName: customer.customerName || 'Test Customer',
            customerGstin: customer.gstNumber,
            placeOfSupply: '', // BLANK INTENTIONALLY
            grandTotal: 1000,
            status: 'Confirmed'
        });
        
        console.log(`✅ Created Invoice ${dummyInvoice.invoiceNumber} with blank POS`);
        
        // 2. Test getMissingPosPreview
        console.log('\n🔍 Testing getMissingPosPreview API...');
        
        // Mock req/res
        const mockReq = {};
        const mockRes = {
            json: function(data) {
                console.log(`Result: count = ${data.count}`);
                const dummy = data.preview.find(p => p.invoiceNumber === dummyInvoiceNumber);
                if (dummy) {
                    console.log(`✅ Found our dummy! Suggested POS: ${dummy.suggestedPos}`);
                } else {
                    console.log(`❌ Did not find our dummy!`);
                }
            },
            status: function(code) { return this; }
        };
        
        await getMissingPosPreview(mockReq, mockRes);
        
        // 3. Test syncMissingPos
        console.log('\n⚡ Testing syncMissingPos API...');
        
        // Let's get the suggested POS for the update payload
        // We will query it first
        const inv = await SalesInvoice.findOne({ invoiceNumber: dummyInvoiceNumber }).lean();
        
        const mockSyncReq = {
            user: { id: new mongoose.Types.ObjectId() },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'test-script' },
            body: {
                updates: [
                    { id: inv._id, suggestedPos: '07-Delhi' }
                ]
            }
        };
        
        const mockSyncRes = {
            json: function(data) {
                console.log(`✅ Sync Result: updated ${data.updatedCount} invoices. Numbers: ${data.updatedInvoices.join(', ')}`);
            },
            status: function(code) { return this; }
        };
        
        await syncMissingPos(mockSyncReq, mockSyncRes);
        
        // 4. Verify in DB
        const updatedInv = await SalesInvoice.findOne({ invoiceNumber: dummyInvoiceNumber });
        if (updatedInv && updatedInv.placeOfSupply === '07-Delhi') {
            console.log('\n✅ DB Verification Passed! POS is now 07-Delhi');
        } else {
            console.log('\n❌ DB Verification Failed!');
        }
        
        // Cleanup
        await SalesInvoice.deleteOne({ invoiceNumber: dummyInvoiceNumber });
        console.log('🧹 Cleaned up dummy invoice.');

    } catch (err) {
        console.error('❌ Error:', err);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
}

testUtility();
