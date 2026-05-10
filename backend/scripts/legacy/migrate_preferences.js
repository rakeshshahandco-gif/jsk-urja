import mongoose from 'mongoose';
import UserHomePreference from './src/models/userHomePreference.model.js';
import dotenv from 'dotenv';
dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jskurja');
        console.log('Connected to DB');

        const result = await UserHomePreference.updateMany(
            { moduleName: { $exists: false } },
            { $set: { moduleName: 'dashboard' } }
        );

        console.log(`Updated ${result.modifiedCount} records`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

migrate();
