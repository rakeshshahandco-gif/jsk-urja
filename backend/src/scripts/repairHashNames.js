
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { propagateNameChange } from '../utils/namePropagator.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const cleanupPrefix = (str) => {
    if (typeof str !== 'string') return str;
    return str.startsWith('#') ? str.substring(1).trim() : str;
};

async function runRepair() {
    try {
        logger.info('🚀 Starting Hashtag Name Repair Script...');
        await mongoose.connect(process.env.MONGODB_URL);
        const db = mongoose.connection.db;

        // --- PART 1: Master Records ---
        // These are important because changing them triggers propagation to children
        
        // 1. Customers
        const customers = await db.collection('customers').find({
            $or: [{ company: /^#/ }, { customerName: /^#/ }]
        }).toArray();

        logger.info(`🔍 Found ${customers.length} Customers with # names`);
        for (const c of customers) {
            const oldName = c.company || c.customerName;
            const newName = cleanupPrefix(oldName);
            
            logger.info(`🔧 Repairing Customer Master [${c._id}]: "${oldName}" -> "${newName}"`);
            
            // Update Master
            await db.collection('customers').updateOne(
                { _id: c._id },
                { $set: { company: newName, customerName: newName } }
            );

            // Propagate to all transactions
            await propagateNameChange({
                id: c._id,
                oldName: oldName,
                newName: newName,
                type: 'Customer',
                force: true
            });
        }

        // 2. Suppliers
        const suppliers = await db.collection('suppliers').find({
            supplierName: /^#/
        }).toArray();

        logger.info(`🔍 Found ${suppliers.length} Suppliers with # names`);
        for (const s of suppliers) {
            const oldName = s.supplierName;
            const newName = cleanupPrefix(oldName);

            logger.info(`🔧 Repairing Supplier Master [${s._id}]: "${oldName}" -> "${newName}"`);

            // Update Master
            await db.collection('suppliers').updateOne(
                { _id: s._id },
                { $set: { supplierName: newName } }
            );

            // Propagate
            await propagateNameChange({
                id: s._id,
                oldName: oldName,
                newName: newName,
                type: 'Supplier',
                force: true
            });
        }

        // --- PART 2: Global Sweep (Dangling Records) ---
        // This catches invoices or orders where the Master might be missing or already changed
        
        const collections = await db.listCollections().toArray();
        const commonFields = ['customerName', 'supplierName', 'name', 'ledgerName', 'partyName', 'company'];

        for (const colInfo of collections) {
            const colName = colInfo.name;
            const collection = db.collection(colName);

            // We update any record that has a field starting with #
            for (const field of commonFields) {
                const query = { [field]: /^#/ };
                const matches = await collection.find(query).toArray();
                
                if (matches.length > 0) {
                    logger.info(`🧹 Found ${matches.length} dangling records in [${colName}] for field "${field}"`);
                    for (const m of matches) {
                        const newName = cleanupPrefix(m[field]);
                        await collection.updateOne(
                            { _id: m._id },
                            { $set: { [field]: newName } }
                        );
                    }
                }
            }
            
            // Special Case: Vouchers with nested items.ledgerName
            if (colName === 'vouchers') {
                const vQuery = { 'items.ledgerName': /^#/ };
                const vMatches = await collection.find(vQuery).toArray();
                if (vMatches.length > 0) {
                    logger.info(`🧹 Found ${vMatches.length} vouchers with # in items.ledgerName`);
                    for (const v of vMatches) {
                        const newItems = v.items.map(item => ({
                            ...item,
                            ledgerName: cleanupPrefix(item.ledgerName)
                        }));
                        await collection.updateOne(
                            { _id: v._id },
                            { $set: { items: newItems } }
                        );
                    }
                }
            }
        }

        logger.info('✅ Global Repair Completed Successfully');
        await mongoose.disconnect();
    } catch (err) {
        logger.error('❌ Repair Failed:', err);
        process.exit(1);
    }
}

runRepair();
