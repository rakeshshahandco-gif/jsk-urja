import mongoose from 'mongoose';
import Customer from '../backend/src/models/customer.model.js';

const MONGODB_URL = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

const diag = async () => {
    try {
        await mongoose.connect(MONGODB_URL);
        console.log('Connected to MongoDB');

        const cs = await Customer.find({ 
            $or: [
                { customerName: /VENTURE/i }, 
                { company: /VENTURE/i }
            ] 
        });
        console.log('--- Customers with VENTURE ---');
        console.log(JSON.stringify(cs, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Diag failed:', error);
        process.exit(1);
    }
};

diag();
