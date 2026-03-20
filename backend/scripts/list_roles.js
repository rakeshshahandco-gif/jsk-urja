import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

const Role = mongoose.model('Role', new mongoose.Schema({ name: String }));

async function listRoles() {
    try {
        await mongoose.connect(MONGODB_URL);
        const roles = await Role.find({});
        console.log('Roles in DB:');
        roles.forEach(r => console.log(`- "${r.name}" (${r._id})`));
    } finally {
        await mongoose.disconnect();
    }
}

listRoles();
