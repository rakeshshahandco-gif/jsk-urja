import 'dotenv/config';
import mongoose from 'mongoose';
import { getSystemDiscovery } from '../src/controllers/diagnostic.controller.js';

async function verifyDiagnostics() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected!');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockReq = {};
    const mockRes = {
        json: function(response) {
            console.log('📊 Diagnostic Response structure check:');
            console.log('- Success:', response.success);
            console.log('- DB Status:', response.data.system.database);
            console.log('- DB Name:', response.data.system.databaseName);
            console.log('- DB Counts:', Object.keys(response.data.system.databaseCounts));
            
            if (response.data.system.databaseName && Object.keys(response.data.system.databaseCounts).length > 0) {
                console.log('✅ Diagnostic Backend Verified!');
            } else {
                console.log('❌ Diagnostic Backend failed validation!');
            }
        }
    };

    const mockNext = (err) => {
        if (err) console.error('❌ Error in controller:', err);
    };

    try {
        await getSystemDiscovery(mockReq, mockRes, mockNext);
    } catch (err) {
        console.error('❌ Crash:', err);
    }

    await mongoose.disconnect();
}

verifyDiagnostics();
