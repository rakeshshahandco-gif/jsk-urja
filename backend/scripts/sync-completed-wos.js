import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkOrder } from '../src/models/workOrder.model.js';
import { syncWorkOrderToInventory } from '../src/services/inventory.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function runSync() {
    console.log('Starting Inventory Synchronization for Existing Completed Work Orders...');
    
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const completedWos = await WorkOrder.find({
            status: 'Completed',
            inventorySynced: { $ne: true }
        });

        console.log(`Found ${completedWos.length} completed work orders that need synchronization.`);

        for (const wo of completedWos) {
            console.log(`Syncing Work Order: ${wo.woNumber} (${wo.finishedProductName})`);
            
            const session = await mongoose.startSession();
            session.startTransaction();
            try {
                // We pass a dummy userId for system-level sync
                await syncWorkOrderToInventory(wo, session, '000000000000000000000000');
                console.log(`Inventory sync logic ran for ${wo.woNumber}. Synced flag: ${wo.inventorySynced}`);
                await wo.save({ session });
                await session.commitTransaction();
                console.log(`Successfully synced and saved ${wo.woNumber}`);
            } catch (err) {
                await session.abortTransaction();
                console.error(`Failed to sync ${wo.woNumber}. Error:`, err);
                if (err.errors) {
                    console.error('Validation Errors:', Object.keys(err.errors).map(k => `${k}: ${err.errors[k].message}`).join(', '));
                }
            } finally {
                session.endSession();
            }
        }

        console.log('Synchronization complete.');
    } catch (error) {
        console.error('Fatal error during sync:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runSync();
