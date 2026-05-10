import mongoose from 'mongoose';

const PROD_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-prod?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

const CustomerSchema = new mongoose.Schema({
    customerName: String,
    company: String,
    gstNumber: String
});

const SalesInvoiceSchema = new mongoose.Schema({
    invoiceNumber: String,
    customerName: String,
    customerGstin: String,
    customerId: mongoose.Schema.Types.ObjectId
});

const Customer = mongoose.model('Customer', CustomerSchema);
const SalesInvoice = mongoose.model('SalesInvoice', SalesInvoiceSchema);

async function repairInvoices() {
    try {
        await mongoose.connect(PROD_URL);
        console.log('Connected to PRODUCTION DB');

        const invoices = await SalesInvoice.find({ customerId: null });
        console.log(`Found ${invoices.length} invoices with null customerId`);

        let fixed = 0;
        for (const inv of invoices) {
            // Try to match by Name exactly
            let customer = await Customer.findOne({ 
                $or: [
                    { company: inv.customerName },
                    { customerName: inv.customerName }
                ]
            });

            // If not found, try by GSTIN
            if (!customer && inv.customerGstin) {
                customer = await Customer.findOne({ gstNumber: inv.customerGstin });
            }

            // If still not found, try fuzzy name (startsWith)
            if (!customer) {
                // Remove (INDIA) or other bracketed info for better matching
                const cleanName = inv.customerName.split('(')[0].trim();
                customer = await Customer.findOne({ 
                    $or: [
                        { company: new RegExp('^' + cleanName, 'i') },
                        { customerName: new RegExp('^' + cleanName, 'i') }
                    ]
                });
            }

            if (customer) {
                inv.customerId = customer._id;
                await inv.save();
                fixed++;
            }
        }

        console.log(`Successfully linked ${fixed} invoices to customers.`);
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

repairInvoices();
