import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function execute() {
    try {
        console.log('Connecting to: ', process.env.MONGODB_URL ? 'Using MONGODB_URL' : 'Using Fallback');
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb+srv://admin:jskurja@jskurja.wsugxms.mongodb.net/jskurja-dev?retryWrites=true&w=majority');
        
        await mongoose.connection.collection('salesorders').deleteMany({});
        console.log('Successfully dropped all sales orders from local Dev DB.');
        
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
execute();
