import 'dotenv/config';
import mongoose from 'mongoose';
import { generateBackup, listBackups } from '../src/services/backup.service.js';
import fs from 'fs';
import path from 'path';

async function testBackup() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!');

    try {
        console.log('🚀 Triggering manual backup...');
        const backup = await generateBackup('system-admin-test', 'Automated Verification Test');
        console.log('✅ Backup created:', backup.id);
        console.log('- Filename:', backup.filename);
        console.log('- Size:', (backup.size / 1024).toFixed(2), 'KB');
        console.log('- Collections backed up:', Object.keys(backup.counts).length);

        const backups = listBackups();
        console.log('📊 Total backups in index:', backups.length);

        if (backups.length > 0 && backups[0].id === backup.id) {
            console.log('✅ Indexing verified!');
        } else {
            console.log('❌ Indexing failed!');
        }

    } catch (error) {
        console.error('❌ Backup test failed:', error);
    }

    await mongoose.disconnect();
    console.log('👋 Disconnected.');
}

testBackup();
