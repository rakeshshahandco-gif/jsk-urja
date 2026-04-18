import mongoose from 'mongoose';
import Customer from './models/customer.model.js';
import { Supplier } from './models/supplier.model.js';
import { SalesInvoice } from './models/salesInvoice.model.js';
import { SalesOrder } from './models/salesOrder.model.js';
import { LedgerEntry } from './models/ledgerEntry.model.js';
import { propagateNameChange } from './utils/namePropagator.js';
import * as dotenv from 'dotenv';

dotenv.config();

const repairNames = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk_urja');
        console.log('✅ Connected to MongoDB');

        // 1. Repair Customers
        const customers = await Customer.find({ isDeleted: false });
        console.log(`📊 Processing ${customers.length} customers...`);

        for (const customer of customers) {
            const currentName = customer.company || customer.customerName;
            // We force a propagation for all customers to ensure everything is synced
            // In a real production environment, we might check for specific mismatches, 
            // but here we want to BE SURE.
            console.log(`⚙️ Syncing references for: ${currentName}...`);
            await propagateNameChange({
                id: customer._id,
                oldName: '', 
                newName: currentName,
                type: 'Customer',
                force: true
            });
        }

        // 2. Repair Suppliers
        const suppliers = await Supplier.find({ isDeleted: false });
        console.log(`📊 Processing ${suppliers.length} suppliers...`);

        for (const supplier of suppliers) {
            const currentName = supplier.supplierName;
            console.log(`⚙️ Syncing references for: ${currentName}...`);
            await propagateNameChange({
                id: supplier._id,
                oldName: '',
                newName: currentName,
                type: 'Supplier',
                force: true
            });
        }

        // 3. Final Sweep for "#ZYZ" specifically
        console.log('🧹 Performing final sweep for "#ZYZ" -> "ZYZ"...');
        const sweepSI = await SalesInvoice.updateMany(
            { customerName: /#ZYZ/i },
            { $set: { customerName: 'ZYZ' } }
        );
        console.log(`✅ Fixed ${sweepSI.modifiedCount} invoices in sweep.`);

        console.log('🎉 All names have been reconciled and propagated!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error repairing names:', error);
        process.exit(1);
    }
};

// We need to modify namePropagator slightly to support the FORCE_UPDATE trick 
// OR just pass different names.
repairNames();
