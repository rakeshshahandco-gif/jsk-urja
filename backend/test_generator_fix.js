import mongoose from 'mongoose';
import { WeChatGroup } from './src/models/weChatGroup.model.js';
import dotenv from 'dotenv';

dotenv.config();

const testGenerator = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');
        
        const lastGroup = await WeChatGroup.findOne().sort({ createdAt: -1 });
        console.log('Last Group EntryNo:', lastGroup ? lastGroup.entryNo : 'NONE');
        
        let nextNum = 1;
        if (lastGroup && lastGroup.entryNo) {
            const match = lastGroup.entryNo.match(/(\d+)$/);
            console.log('Regex Match:', match);
            if (match) {
                nextNum = parseInt(match[1]) + 1;
            }
        }
        const generated = `WCG-${String(nextNum).padStart(4, '0')}`;
        console.log('Generated ID:', generated);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testGenerator();
