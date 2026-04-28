import 'dotenv/config';
import mongoose from 'mongoose';
import { SalesInvoice } from '../src/models/salesInvoice.model.js';
import Customer from '../src/models/customer.model.js';
import { updateGstDetails } from '../src/controllers/salesInvoice.controller.js';
import { AuditLog } from '../src/models/auditLog.model.js';

async function testGstCorrection() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!\n');

    try {
        console.log('📝 Setting up dummy invoice...');
        const customer = await Customer.findOne({});
        if (!customer) throw new Error("Need a customer to test");
        
        const dummyNumber = 'TEST-GST-CORR-001';
        await SalesInvoice.deleteMany({ invoiceNumber: dummyNumber });
        
        const inv = await SalesInvoice.create({
            invoiceNumber: dummyNumber,
            invoiceDate: new Date(),
            customerId: customer._id,
            customerName: customer.customerName || 'Test Customer',
            customerGstin: customer.gstNumber,
            placeOfSupply: '', // BLANK
            billingStateCode: '',
            gstType: '',
            grandTotal: 1000,
            status: 'Confirmed'
        });
        
        console.log(`✅ Created Invoice ${inv.invoiceNumber} with blank POS`);
        
        // Mock request
        const mockReq = {
            params: { id: inv._id },
            user: { id: new mongoose.Types.ObjectId() },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'test' },
            body: {
                placeOfSupply: '07-Delhi',
                billingStateCode: '07',
                gstType: 'IGST',
                reason: 'Testing Admin Mode GST Correction'
            }
        };
        
        const responsePromise = new Promise((resolve, reject) => {
            const mockNext = (err) => {
                if (err) reject(err);
                else resolve();
            };
            
            const mockRes = {
                json: function(data) {
                    console.log('✅ Response:', data.message);
                    resolve(data);
                },
                status: function(code) { return this; }
            };
            
            console.log('\n⚡ Testing updateGstDetails...');
            updateGstDetails(mockReq, mockRes, mockNext);
        });
        
        await responsePromise;
        
        // Verify in DB
        const updated = await SalesInvoice.findById(inv._id);
        if (updated.placeOfSupply === '07-Delhi' && updated.billingStateCode === '07' && updated.gstType === 'IGST') {
            console.log('✅ DB Update Successful!');
        } else {
            console.log('❌ DB Update Failed', updated.placeOfSupply);
        }
        
        // Verify Audit Log
        const log = await AuditLog.findOne({ resourceId: inv._id, action: 'UPDATE' });
        if (log && log.details.reason === 'Testing Admin Mode GST Correction') {
            console.log('✅ Audit Log Created!');
        } else {
            console.log('❌ Audit Log Missing');
        }
        
        await SalesInvoice.deleteMany({ invoiceNumber: dummyNumber });
        await AuditLog.deleteMany({ resourceId: inv._id });
        console.log('🧹 Cleaned up.');

    } catch (err) {
        console.error('❌ Error:', err);
    }
    await mongoose.disconnect();
}

testGstCorrection();
