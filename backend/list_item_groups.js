import mongoose from 'mongoose';
import { ItemGroup } from './src/models/itemGroup.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const groups = await ItemGroup.find({ isActive: true }).select('name code');
        console.log('All Active Item Groups:', JSON.stringify(groups, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
