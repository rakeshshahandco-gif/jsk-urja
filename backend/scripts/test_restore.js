import 'dotenv/config';
import mongoose from 'mongoose';
import { generateBackup, listBackups, restoreBackup } from '../src/services/backup.service.js';

async function testRestore() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    const db = mongoose.connection.db;

    try {
        const testColName = 'backup_restore_test';
        console.log('📝 Setting up test data in:', testColName);
        
        await db.collection(testColName).drop().catch(() => {});
        await db.collection(testColName).insertOne({ name: 'Original State', value: 100 });

        console.log('🚀 Taking backup...');
        const backup = await generateBackup('tester', 'Restore Verification Source');
        
        console.log('🔨 Modifying data (Breaking the system)...');
        await db.collection(testColName).updateOne({ name: 'Original State' }, { $set: { value: 999, status: 'corrupted' } });
        
        const corrupted = await db.collection(testColName).findOne({ name: 'Original State' });
        console.log('- Current value (corrupted):', corrupted.value);

        console.log('🔄 Initiating Restore from:', backup.id);
        const restoreResult = await restoreBackup(backup.id, 'tester');
        console.log('✅ Restore Result:', restoreResult.message);

        const restored = await db.collection(testColName).findOne({ name: 'Original State' });
        console.log('- Value after restore:', restored.value);

        if (restored.value === 100) {
            console.log('✅ RESTORE VERIFIED: Data is back to original state!');
        } else {
            console.log('❌ RESTORE FAILED: Data mismatch!');
        }

        const backups = listBackups();
        const safetyBackup = backups.find(b => b.reason.includes('Auto-Safety Backup'));
        if (safetyBackup) {
            console.log('✅ SAFETY BACKUP VERIFIED: Found automatic backup created during restore.');
        } else {
            console.log('❌ SAFETY BACKUP MISSING!');
        }

    } catch (error) {
        console.error('❌ Restore test failed:', error);
    }

    await mongoose.disconnect();
}

testRestore();
