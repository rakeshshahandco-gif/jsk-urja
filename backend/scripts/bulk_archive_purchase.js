import mongoose from 'mongoose';
import { PurchaseOrder } from '../src/models/purchaseOrder.model.js';
import { PurchaseInvoice } from '../src/models/purchaseInvoice.model.js';
import { AuditLog } from '../src/models/auditLog.model.js';
import { User } from '../src/models/user.model.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB...');

        const user = await User.findOne({});
        if (!user) {
            console.log('No user found for audit logging.');
            process.exit(1);
        }

        const reason = 'User requested bulk cleanup / Soft delete of all existing records';
        const timestamp = new Date();

        console.log('Archiving Purchase Orders...');
        const poResult = await PurchaseOrder.updateMany(
            { isDeleted: { $ne: true } },
            { 
                $set: { 
                    isDeleted: true, 
                    deletedAt: timestamp, 
                    deletedBy: user._id, 
                    deleteReason: reason 
                } 
            }
        );
        console.log(`Archived ${poResult.modifiedCount} Purchase Orders.`);

        console.log('Archiving Purchase Invoices...');
        const piResult = await PurchaseInvoice.updateMany(
            { isDeleted: { $ne: true } },
            { 
                $set: { 
                    isDeleted: true, 
                    deletedAt: timestamp, 
                    deletedBy: user._id, 
                    deleteReason: reason,
                    status: 'Cancelled' 
                } 
            }
        );
        console.log(`Archived ${piResult.modifiedCount} Purchase Invoices.`);

        // Add Bulk Audit Logs
        await AuditLog.create({
            user: user._id,
            action: 'DELETE',
            module: 'System',
            description: `Bulk Archiving: ${poResult.modifiedCount} POs and ${piResult.modifiedCount} PIs archived.`,
            details: { reason, poCount: poResult.modifiedCount, piCount: piResult.modifiedCount }
        });

        console.log('Done! All records archived safely.');
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
