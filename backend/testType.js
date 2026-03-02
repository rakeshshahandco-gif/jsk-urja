import mongoose from 'mongoose';
import config from './src/config/config.js';
import Customer from './src/models/customer.model.js';

mongoose.connect(config.mongoose.url, config.mongoose.options).then(async () => {
    const types = await Customer.distinct('customerType', { isDeleted: false, customerType: { $ne: '' } });
    console.log("distinct types in db:", types);
    process.exit(0);
});
