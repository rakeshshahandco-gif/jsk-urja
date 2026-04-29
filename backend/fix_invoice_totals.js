
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalesInvoice } from './src/models/salesInvoice.model.js';

dotenv.config({ path: './.env' });

const fixTotals = async () => {
    try {
        const mongoUri = process.env.MONGODB_URL;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const allInvoices = await SalesInvoice.find({}).lean();
        console.log('Total Invoices to check:', allInvoices.length);

        let fixedCount = 0;
        for (const inv of allInvoices) {
            let changed = false;
            let totalTaxable = 0;
            let totalGst = 0;
            let totalQty = 0;

            const updatedItems = inv.items.map(item => {
                const qty = item.qty || 0;
                const rate = item.rate || 0;
                const discountAmount = item.discountAmount || 0;
                
                const taxableAmount = (qty * rate) - discountAmount;
                const gstRate = item.gstRate || 0;
                const gstAmount = (taxableAmount * gstRate) / 100;
                const totalAmount = taxableAmount + gstAmount;

                if (item.taxableAmount !== taxableAmount || item.totalAmount !== totalAmount) {
                    changed = true;
                    return {
                        ...item,
                        taxableAmount,
                        cgstAmount: item.cgstRate ? (taxableAmount * item.cgstRate) / 100 : 0,
                        sgstAmount: item.sgstRate ? (taxableAmount * item.sgstRate) / 100 : 0,
                        igstAmount: item.igstRate ? (taxableAmount * item.igstRate) / 100 : 0,
                        totalAmount
                    };
                }
                totalTaxable += taxableAmount;
                totalQty += qty;
                return item;
            });

            // Recalculate header totals too
            const newTotalTaxable = updatedItems.reduce((sum, i) => sum + (i.taxableAmount || 0), 0);
            const newTotalGst = updatedItems.reduce((sum, i) => sum + (i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0), 0);
            const newGrandTotal = newTotalTaxable + newTotalGst + (inv.freightAmount || 0);

            if (changed || inv.totalTaxableAmount !== newTotalTaxable || inv.grandTotal !== newGrandTotal) {
                await SalesInvoice.updateOne(
                    { _id: inv._id },
                    { 
                        $set: { 
                            items: updatedItems,
                            totalTaxableAmount: newTotalTaxable,
                            totalGst: newTotalGst,
                            grandTotal: newGrandTotal,
                            roundedTotal: Math.round(newGrandTotal)
                        } 
                    }
                );
                fixedCount++;
            }
        }

        console.log('Successfully fixed', fixedCount, 'invoices.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixTotals();
