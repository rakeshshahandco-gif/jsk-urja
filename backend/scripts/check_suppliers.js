import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGODB_URL).then(async () => {
    try {
        const count = await mongoose.connection.collection('suppliers').countDocuments();
        console.log('Suppliers Count:', count);

        // Also let's check if the API would fail to stringify or something
        const Supplier = mongoose.model('Supplier', new mongoose.Schema({}, { strict: false }));
        const suppliers = await Supplier.find({}).limit(1);
        console.log('Sample supplier:', suppliers.length > 0 ? 'exists' : 'none');

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
});
