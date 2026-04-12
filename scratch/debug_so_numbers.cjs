const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

const { SalesOrder } = require('./backend/src/models/salesOrder.model');
const { InvoiceSeries } = require('./backend/src/models/invoiceSeries.model');

(async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jskurja-dev');
        console.log('Connected to DB');

        const lastSOs = await SalesOrder.find({ isDeleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .limit(10);
        
        console.log('--- Last 10 Sales Orders ---');
        lastSOs.forEach(so => {
            console.log(`ID: ${so._id}, Number: ${so.soNumber}, Seq: ${so.sequenceNumber}, FY: ${so.financialYear}`);
        });

        const series = await InvoiceSeries.find({ isActive: true });
        console.log('\n--- Active Invoice Series ---');
        series.forEach(s => {
            console.log(`ID: ${s._id}, Prefix: ${s.prefix}, Current: ${s.currentNumber}, Start: ${s.startNumber}, FY: ${s.financialYear}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
