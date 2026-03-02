import mongoose from 'mongoose';
import Customer from './src/models/customer.model.js';

const uri = "mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected');

        const customer = await Customer.findOne({});
        if (!customer) {
            console.log('No customer found');
            process.exit(0);
        }

        console.log('Updating customer:', customer._id);
        customer.customerType = 'My Custom Type';

        // Attempt to validate
        try {
            await customer.validate();
            console.log('Validation passed!');

            // Also test with runValidators: true in findByIdAndUpdate to mimic the controller exactly
            await Customer.findByIdAndUpdate(
                customer._id,
                { customerType: 'My Custom Type 2' },
                { new: true, runValidators: true }
            );
            console.log('Update passed!');
        } catch (err) {
            console.log('Validation/Update Error:', err.message);
        }

    } catch (err) {
        console.log('Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
run();
