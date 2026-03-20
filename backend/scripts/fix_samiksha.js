import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

async function fixSamiksha() {
    try {
        await mongoose.connect(MONGODB_URL);
        
        const Role = mongoose.models.Role || mongoose.model('Role', new mongoose.Schema({ name: String }));
        const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
            username: String,
            roleName: String,
            role: mongoose.Schema.Types.ObjectId,
            permissions: [String]
        }));

        const superadminRole = await Role.findOne({ name: 'superadmin' });
        if (!superadminRole) {
            console.error('superadmin role not found!');
            return;
        }

        const s = await User.findOne({ username: 'samiksha' });
        if (s) {
            console.log(`Updating samiksha (ID: ${s._id}) to superadmin`);
            s.role = superadminRole._id;
            s.roleName = 'superadmin';
            // Also give her full permissions just in case
            s.permissions = ['*']; 
            await s.save();
            console.log('Update successful.');
        } else {
            console.log('User samiksha not found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

fixSamiksha();
