import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const dropIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const User = mongoose.connection.collection('users');

        try {
            await User.dropIndex('email_1');
            console.log('Successfully dropped index email_1');
        } catch (e) {
            if (e.codeName === 'IndexNotFound') {
                console.log('Index email_1 not found, nothing to drop');
            } else {
                throw e;
            }
        }

        console.log('Closing connection...');
    } catch (error) {
        console.error('Failed to drop index:', error);
    } finally {
        await mongoose.disconnect();
    }
};

dropIndex();
