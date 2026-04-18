import mongoose from 'mongoose';
import { SalesInvoice } from './models/salesInvoice.model.js';
import Customer from './models/customer.model.js';
import { AccountLedger } from './models/accountLedger.model.js';

const verify = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/jsk_urja');
        console.log('✅ Connected');

        console.log('--- CUSTOMERS ---');
        const cs = await Customer.find({ $or: [{ customerName: /ZYZ/i }, { company: /ZYZ/i }] });
        cs.forEach(c => console.log(`C: [${c._id}] ${c.customerCode} Name: "${c.customerName}" Co: "${c.company}"`));

        console.log('--- INVOICES ---');
        const sis = await SalesInvoice.find({ customerName: /ZYZ/i });
        sis.forEach(s => console.log(`I: [${s._id}] ${s.invoiceNumber} Name: "${s.customerName}" CID: ${s.customerId}`));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
verify();
