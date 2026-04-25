import mongoose from 'mongoose';
import { SalesInvoice } from './src/models/salesInvoice.model.js';
import { Voucher } from './src/models/voucher.model.js';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        const prodUrl = process.env.MONGODB_URL.replace('jskurja-dev', 'jskurja-prod');
        await mongoose.connect(prodUrl);
        console.log('MongoDB Connected to PROD');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

const fixInvoice = async (invoiceNo) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const invoice = await SalesInvoice.findOne({ invoiceNumber: invoiceNo }).session(session);
        if (!invoice) {
            console.log(`Invoice ${invoiceNo} not found`);
            return;
        }

        // Find the receipt voucher that corresponds to this invoice
        // Usually the receipt voucher has the same voucherNo or references it
        // Or we can find by nature: 'Receipt' and partyId = invoice.customerId and amount = invoice.grandTotal
        
        const receipts = await Voucher.find({ 
            nature: 'Receipt',
            partyId: invoice.customerId,
            totalAmount: invoice.roundedTotal || invoice.grandTotal
        }).session(session);

        if (receipts.length === 0) {
            console.log(`No receipt found for invoice ${invoiceNo}`);
            return;
        }

        const receipt = receipts[0];
        console.log(`Found Receipt ${receipt.voucherNo} for Invoice ${invoiceNo}`);

        // Update the receipt item's adjustment
        const adjustment = {
            adjustmentType: 'Against Bill',
            refId: invoice._id,
            refModel: 'SalesInvoice',
            refNumber: invoice.invoiceNumber,
            amount: invoice.roundedTotal || invoice.grandTotal
        };

        receipt.items[0].adjustments = [adjustment];
        await receipt.save({ session });

        // Update the invoice
        invoice.paidAmount = invoice.roundedTotal || invoice.grandTotal;
        invoice.paymentStatus = 'Paid';
        
        // Add to history
        const hasPaymentLog = invoice.payments.find(p => p.reference === receipt.voucherNo);
        if (!hasPaymentLog) {
            invoice.payments.push({
                paymentDate: receipt.date,
                amountPaid: adjustment.amount,
                paymentMode: 'Voucher',
                reference: receipt.voucherNo,
                remarks: `Receipt Voucher ${receipt.voucherNo}`
            });
        }
        await invoice.save({ session });

        await session.commitTransaction();
        console.log(`Successfully fixed Invoice ${invoiceNo} and linked to Receipt ${receipt.voucherNo}`);
    } catch (e) {
        await session.abortTransaction();
        console.error('Error fixing invoice:', e);
    } finally {
        session.endSession();
    }
};

const run = async () => {
    await connectDB();
    await fixInvoice('26-27/018');
    await fixInvoice('26-27/12');
    process.exit(0);
};

run();
