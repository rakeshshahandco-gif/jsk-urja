import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { StockLedger } from '../models/stockLedger.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { GRN } from '../models/grn.model.js';
import { PurchaseInvoice } from '../models/purchaseInvoice.model.js';
import { Item } from '../models/item.model.js';
import Customer from '../models/customer.model.js';
import { Supplier } from '../models/supplier.model.js';

dotenv.config();

const backfill = async () => {
    try {
        const uri = process.env.MONGODB_URL;
        if (!uri) throw new Error('MONGODB_URL not found in environment');
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const entries = await StockLedger.find({
            $or: [
                { partyName: { $exists: false } },
                { partyName: '' },
                { voucherType: { $exists: false } },
                { voucherType: '' }
            ]
        });

        console.log(`Found ${entries.length} entries to backfill`);

        for (const entry of entries) {
            let update = {};

            // 1. Determine Voucher Type if missing
            if (!entry.voucherType) {
                if (entry.transactionType === 'SALES_INVOICE') update.voucherType = 'Sales Outward';
                else if (entry.transactionType === 'GRN') update.voucherType = 'Purchase Inward';
                else if (entry.transactionType === 'PURCHASE_INVOICE') update.voucherType = 'Purchase Inward';
                else if (entry.transactionType === 'WO_OUTPUT') update.voucherType = 'Production Inward';
                else if (entry.transactionType === 'WO_CONSUMPTION') update.voucherType = 'Production Consumption';
                else if (entry.transactionType === 'OPENING') update.voucherType = 'Opening Balance';
            }

            // 2. Fetch Party Info based on Transaction Type
            if (entry.transactionType === 'SALES_INVOICE' && entry.referenceId) {
                const inv = await SalesInvoice.findById(entry.referenceId).populate('customerId');
                if (inv && inv.customerId) {
                    update.partyId = inv.customerId._id;
                    update.partyModel = 'Customer';
                    update.partyName = inv.customerId.customerName || inv.customerId.name;
                    update.partyCode = inv.customerId.customerCode;
                }
            } else if ((entry.transactionType === 'GRN' || entry.transactionType === 'PURCHASE_INVOICE') && entry.referenceId) {
                let doc = await GRN.findById(entry.referenceId).populate('supplierId');
                if (!doc) doc = await PurchaseInvoice.findById(entry.referenceId).populate('supplierId');
                
                if (doc && doc.supplierId) {
                    update.partyId = doc.supplierId._id;
                    update.partyModel = 'Supplier';
                    update.partyName = doc.supplierId.supplierName || doc.supplierId.name;
                    update.partyCode = doc.supplierId.supplierCode;
                }
            }

            // 3. Fetch Item Metadata if missing
            if (!entry.itemGroup || !entry.uom) {
                const item = await Item.findById(entry.itemId);
                if (item) {
                    update.itemGroup = item.itemCategory;
                    update.itemType = item.itemType;
                    update.uom = item.uom;
                    update.itemCode = item.itemCode;
                    update.itemName = item.itemName;
                }
            }

            if (Object.keys(update).length > 0) {
                await StockLedger.findByIdAndUpdate(entry._id, { $set: update });
            }
        }

        console.log('Backfill completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    }
};

backfill();
