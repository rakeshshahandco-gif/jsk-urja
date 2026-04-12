import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { User } from '../src/models/user.model.js';

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const users = await User.find({}, 'username email roleName isActive');
        console.log('--- SYSTEM USERS ---');
        console.table(users.map(u => ({
            username: u.username,
            email: u.email,
            role: u.roleName,
            active: u.isActive
        })));
        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
