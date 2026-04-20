
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jsk-urja';

const salesInvoiceSchema = new mongoose.Schema({}, { strict: false });
const SalesInvoice = mongoose.model('SalesInvoice', salesInvoiceSchema, 'salesinvoices');

async function findInvoice() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const invoice = await SalesInvoice.findOne({ 
            $or: [
                { invoiceNumber: '26-27/013' },
                { displayInvoiceNumber: '26-27/013' }
            ]
        });
        
        if (invoice) {
            console.log('FOUND_INVOICE_ID:', invoice._id);
            console.log('INVOICE_NUMBER:', invoice.invoiceNumber);
            console.log('ITEM_COUNT:', invoice.items ? invoice.items.length : 0);
        } else {
            console.log('INVOICE_NOT_FOUND');
            // List some invoices to see formats
            const someInvoices = await SalesInvoice.find().limit(5).select('invoiceNumber displayInvoiceNumber');
            console.log('SAMPLE_INVOICES:', someInvoices);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

findInvoice();
