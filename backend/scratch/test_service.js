import mongoose from 'mongoose';
import * as salesConversionService from '../src/services/salesConversion.service.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function testService() {
  try {
    const mongoUri = process.env.MONGODB_URL;
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    const fyId = '69cbdeacc52dcb1bc1621e70'; // 2026-2027

    console.log('\n--- Testing Funnel ---');
    const funnel = await salesConversionService.getSalesConversionFunnel({ financialYear: fyId });
    console.log('Summary:', funnel.summary);
    console.log('Funnel Steps:', funnel.funnel.map(s => `${s.stage}: ${s.count}`));

    console.log('\n--- Testing Item-Wise Sales ---');
    const itemWise = await salesConversionService.getItemWiseSalesAnalysis({ financialYear: fyId });
    console.log('Top items by value:', itemWise.topByValue.length);
    if(itemWise.topByValue.length > 0) {
      console.log('First item:', itemWise.topByValue[0].itemName, 'Value:', itemWise.topByValue[0].invoiceValue);
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('Test Failed:', err);
  }
}

testService();
