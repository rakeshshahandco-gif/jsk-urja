import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaskMaster } from '../src/models/taskMaster.model.js';
import { Task } from '../src/models/task.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const masters = await TaskMaster.find({ isActive: true });
        console.log(`Found ${masters.length} active masters.`);
        
        for (const m of masters) {
            const instances = await Task.countDocuments({ taskMasterId: m._id });
            console.log(`- Master: ${m.title}`);
            console.log(`  _id: ${m._id}`);
            console.log(`  nextRunDate: ${m.nextRunDate}`);
            console.log(`  lastGeneratedAt: ${m.lastGeneratedAt}`);
            console.log(`  Instances count: ${instances}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

check();
