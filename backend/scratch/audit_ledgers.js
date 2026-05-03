import mongoose from 'mongoose';
import Customer from '../src/models/customer.model.js';
import { Supplier } from '../src/models/supplier.model.js';

const uri = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const totalCustomers = await Customer.countDocuments({});
        const linkedCustomers = await Customer.countDocuments({ ledgerId: { $ne: null } });
        
        const totalSuppliers = await Supplier.countDocuments({});
        const linkedSuppliers = await Supplier.countDocuments({ ledgerId: { $ne: null } });

        console.log('--- CUSTOMERS ---');
        console.log('Total:', totalCustomers);
        console.log('Linked:', linkedCustomers);
        console.log('Unlinked:', totalCustomers - linkedCustomers);

        console.log('--- SUPPLIERS ---');
        console.log('Total:', totalSuppliers);
        console.log('Linked:', linkedSuppliers);
        console.log('Unlinked:', totalSuppliers - linkedSuppliers);

        // Sample unlinked
        const sample = await Customer.findOne({ ledgerId: null }).select('customerName ledgerId');
        console.log('Sample Unlinked Customer:', sample);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
