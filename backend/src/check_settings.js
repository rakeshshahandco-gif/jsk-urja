import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const hrSettingsSchema = new mongoose.Schema({}, { strict: false });
const HRSettings = mongoose.model('HRSettings', hrSettingsSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const settings = await HRSettings.findOne();
        console.log('HR Settings:', JSON.stringify(settings, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

check();
