import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Customer from '../src/models/customer.model.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const result = await Customer.updateMany(
            { $or: [{ city: { $exists: false } }, { city: "" }, { city: null }] },
            [
                {
                    $set: {
                        city: { $ifNull: ["$area", ""] }
                    }
                }
            ]
        );

        console.log(`Migration completed. Matched/Modified: ${result.modifiedCount}`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
