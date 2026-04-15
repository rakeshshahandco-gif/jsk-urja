import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from '../src/models/customer.model.js';
import { SalesOrder } from '../src/models/salesOrder.model.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to DB');
    
    const stages = await Customer.distinct('leadStage');
    const categories = await SalesOrder.distinct('orderCategory');
    const sources = await Customer.distinct('leadSource');
    
    console.log('STAGES:', JSON.stringify(stages));
    console.log('CATEGORIES:', JSON.stringify(categories));
    console.log('SOURCES:', JSON.stringify(sources));
    
    // Check counts to be sure
    const leadCount = await Customer.countDocuments({ status: 'lead' });
    const sampleCount = await SalesOrder.countDocuments({ orderCategory: 'Sample' });
    
    console.log('LEAD COUNT (status=lead):', leadCount);
    console.log('SAMPLE COUNT (category=Sample):', sampleCount);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
