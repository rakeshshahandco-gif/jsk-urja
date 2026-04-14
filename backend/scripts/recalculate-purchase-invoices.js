import mongoose from 'mongoose';
import { PurchaseInvoice } from '../src/models/purchaseInvoice.model.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const r2 = (n) => Math.round((n || 0) * 100) / 100;

const calculateTotals = (items, gstType, freightAmount = 0, freightGstRate = 0) => {
    let subTotal = 0, totalTaxable = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isIGST = gstType === 'IGST';

    const updatedItems = items.map(item => {
        const itemQty = Number(item.qty || 0);
        const itemRate = Number(item.rate || 0);
        const itemDiscPercent = Number(item.discountPercent || 0);
        const itemGstRate = Number(item.gstRate || 0);

        const discountAmount = item.discountAmount !== undefined ? Number(item.discountAmount) : r2(itemQty * itemRate * itemDiscPercent / 100);
        const taxableAmount = r2(itemQty * itemRate - discountAmount);
        
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let cgstRate = 0, sgstRate = 0, igstRate = 0;

        if (isIGST) {
            igstRate = itemGstRate;
            igstAmount = r2(taxableAmount * igstRate / 100);
        } else {
            cgstRate = itemGstRate / 2;
            sgstRate = itemGstRate / 2;
            cgstAmount = r2(taxableAmount * cgstRate / 100);
            sgstAmount = r2(taxableAmount * sgstRate / 100);
        }

        const totalAmount = r2(taxableAmount + cgstAmount + sgstAmount + igstAmount);

        subTotal += r2(itemQty * itemRate);
        totalTaxable += taxableAmount;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            ...item,
            qty: itemQty,
            rate: itemRate,
            discountAmount,
            taxableAmount,
            cgstRate, cgstAmount,
            sgstRate, sgstAmount,
            igstRate, igstAmount,
            totalAmount
        };
    });

    const totalTax = r2(totalIgst + totalCgst + totalSgst);
    const rawGrandTotal = r2(totalTaxable + totalTax + freightAmount);
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = r2(grandTotal - rawGrandTotal);

    return {
        updatedItems,
        subTotal,
        totalTaxableAmount: totalTaxable,
        totalIgst,
        totalCgst,
        totalSgst,
        totalTax,
        roundOff,
        grandTotal
    };
};

async function runRepair() {
    const mongoUrl = process.argv[2] || process.env.MONGODB_URL;
    if (!mongoUrl) {
        console.error('No MONGODB_URL found');
        process.exit(1);
    }

    console.log(`Connecting to: ${mongoUrl.includes('jskurja-prod') ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    try {
        await mongoose.connect(mongoUrl);
        
        const invoices = await PurchaseInvoice.find({ 
            grandTotal: 0,
            isDeleted: { $ne: true }
        });

        console.log(`Found ${invoices.length} invoices with zero total.`);

        for (const inv of invoices) {
            console.log(`Processing ${inv.invoiceNumber}...`);
            
            if (!inv.items || inv.items.length === 0) {
                console.log(` - Skipping ${inv.invoiceNumber}: No items found.`);
                continue;
            }

            const headerTotals = calculateTotals(
                inv.items, 
                inv.gstType, 
                inv.freightAmount || 0, 
                inv.freightGstRate || 0
            );

            // Update document
            inv.items = headerTotals.updatedItems;
            inv.subTotal = headerTotals.subTotal;
            inv.totalTaxableAmount = headerTotals.totalTaxableAmount;
            inv.totalCgst = headerTotals.totalCgst;
            inv.totalSgst = headerTotals.totalSgst;
            inv.totalIgst = headerTotals.totalIgst;
            inv.totalTax = headerTotals.totalTax;
            inv.roundOff = headerTotals.roundOff;
            inv.grandTotal = headerTotals.grandTotal;

            await inv.save();
            console.log(` - Success: Recalculated total as ₹${inv.grandTotal}`);
        }

        console.log('Repair complete.');
    } catch (err) {
        console.error('Repair failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runRepair();
