import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

async function debugSamiksha() {
    try {
        await mongoose.connect(MONGODB_URL);
        
        const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
            username: String,
            roleName: String,
            role: mongoose.Schema.Types.ObjectId
        }));

        const s = await User.findOne({ username: 'samiksha' });
        console.log('Samiksha raw user:', JSON.stringify(s, null, 2));

        if (s && s.role) {
            const Role = mongoose.models.Role || mongoose.model('Role', new mongoose.Schema({ name: String }));
            const r = await Role.findById(s.role);
            console.log('Samiksha raw role:', JSON.stringify(r, null, 2));
        } else {
            console.log('Samiksha has no role ID.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

debugSamiksha();
