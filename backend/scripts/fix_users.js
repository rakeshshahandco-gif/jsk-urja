import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URL = process.env.MONGODB_URL;

if (!MONGODB_URL) {
    console.error('MONGODB_URL not found in .env');
    process.exit(1);
}

// Define models
const Role = mongoose.model('Role', new mongoose.Schema({ name: String }));
const User = mongoose.model('User', new mongoose.Schema({
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
    roleName: String
}));

async function fixUsers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        console.log('Connected.');

        const users = await User.find({}).populate('role');
        console.log(`Checking ${users.length} users...`);

        let updatedCount = 0;
        for (const user of users) {
            const actualRoleName = user.role?.name;
            if (actualRoleName && user.roleName !== actualRoleName) {
                console.log(`Updating user ${user._id} (${user.roleName} -> ${actualRoleName})`);
                user.roleName = actualRoleName;
                await user.save();
                updatedCount++;
            }
        }

        console.log(`Updated ${updatedCount} users.`);
        console.log('User repair complete.');
    } catch (error) {
        console.error('Error during repair:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

fixUsers();
