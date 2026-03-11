import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const { SalesOrder } = await import('./src/models/salesOrder.model.js');
        const { SalesInvoice } = await import('./src/models/salesInvoice.model.js');

        const soRes = await SalesOrder.deleteMany({});
        console.log(`Deleted ${soRes.deletedCount} Sales Orders.`);

        const siRes = await SalesInvoice.deleteMany({});
        console.log(`Deleted ${siRes.deletedCount} Sales Invoices.`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
