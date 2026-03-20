import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

async function listUsers() {
    try {
        await mongoose.connect(MONGODB_URL);
        
        // Define models only if they don't exist
        const Role = mongoose.models.Role || mongoose.model('Role', new mongoose.Schema({ name: String }));
        const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
            username: String,
            roleName: String,
            role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }
        }));

        const users = await User.find({}).populate('role');
        console.log('Users in DB:');
        users.forEach(u => console.log(`- ${u.username}: roleName="${u.roleName}", role.name="${u.role?.name}"`));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

listUsers();
