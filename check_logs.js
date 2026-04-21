import mongoose from 'mongoose';
import CommunicationLog from './backend/src/models/communicationLog.model.js';

const MONGODB_URI = 'mongodb://localhost:27017/jsk-urja';

async function check() {
    try {
        await mongoose.connect(MONGODB_URI);
        const last = await CommunicationLog.findOne().sort({ createdAt: -1 });
        console.log('--- LATEST LOG ---');
        console.log(JSON.stringify(last, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

check();
