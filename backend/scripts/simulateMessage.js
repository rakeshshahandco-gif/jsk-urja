import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createNotification } from '../src/controllers/notification.controller.js';
import { User } from '../src/models/user.model.js';

dotenv.config();

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const admin = await User.findOne({ roleName: 'System Admin' });
        const sender = await User.findOne({ roleName: { $ne: 'System Admin' } });

        if (!admin || !sender) {
            console.log("Users not found");
            process.exit(1);
        }

        console.log(`Sending message to ${admin.name} from ${sender.name}...`);
        
        await createNotification({
            recipient: admin._id.toString(),
            actor: sender._id.toString(),
            type: 'MESSENGER',
            title: `New Message from ${sender.name}`,
            message: 'Hello Admin! This is a live message test!',
            link: '/messenger'
        });

        console.log("Sent.");
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
})();
