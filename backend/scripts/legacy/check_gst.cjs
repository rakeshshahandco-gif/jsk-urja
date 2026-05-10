const mongoose = require('mongoose');

(async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/jsk-urja');
        const db = mongoose.connection.db;
        const customers = await db.collection('customers').find({ gstNumber: { $exists: true, $ne: '' } }).limit(5).toArray();
        console.log("Customers with GST:");
        customers.forEach(c => console.log(`- ${c.customerName || c.company}: ${c.gstNumber}`));
        
        const count = await db.collection('customers').countDocuments({ gstNumber: { $exists: true, $ne: '' } });
        console.log(`\nTotal customers with GST: ${count}`);
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
})();
