import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const STATE_CODE_MAP = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
    '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
    '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};

async function fixData() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to DB.');

    // 1. Update Customer Master
    const Customer = mongoose.model('Customer', new mongoose.Schema({}, { strict: false }));
    const customer = await Customer.findOne({ customerName: /HALOMAX/i });
    if (customer) {
        let pos = customer.defaultPlaceOfSupply;
        if (!pos && customer.gstNumber && customer.gstNumber.length >= 2) {
            const code = customer.gstNumber.substring(0, 2);
            pos = `${code}-${STATE_CODE_MAP[code] || customer.state}`;
        }
        
        console.log(`Updating customer ${customer.customerName} POS to ${pos}`);
        await Customer.updateOne({ _id: customer._id }, { 
            $set: { 
                defaultPlaceOfSupply: pos,
                billingStateCode: customer.gstNumber ? customer.gstNumber.substring(0, 2) : '07'
            } 
        });
        console.log('Customer updated.');
    } else {
        console.log('Customer not found.');
    }

    // 2. Update Sales Invoice
    const SalesInvoice = mongoose.model('SalesInvoice', new mongoose.Schema({}, { strict: false }));
    const invoice = await SalesInvoice.findOne({ invoiceNumber: '26-27/016' });
    if (invoice) {
        console.log(`Updating invoice ${invoice.invoiceNumber} POS to 07-Delhi`);
        await SalesInvoice.updateOne({ _id: invoice._id }, {
            $set: {
                placeOfSupply: '07-Delhi',
                gstType: 'IGST',
                billingStateCode: '07',
                'items.$[].igstRate': 18,
                'items.$[].cgstRate': 0,
                'items.$[].sgstRate': 0,
                // Wait, it is already IGST according to the earlier snapshot
            }
        });
        console.log('Invoice updated.');
    } else {
        console.log('Invoice not found.');
    }

    process.exit(0);
}

fixData().catch(console.error);
