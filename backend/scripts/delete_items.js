import mongoose from 'mongoose';

// Hardcoded URI for immediate script execution
const MONGODB_URI = "mongodb+srv://admin:jskurja@jskurja.wsugxms.mongodb.net/jskurja-dev?retryWrites=true&w=majority";

async function deleteAll() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        // Delete all items
        const itemResult = await mongoose.connection.collection('items').deleteMany({});
        console.log(`Deleted ${itemResult.deletedCount} items.`);

        // Delete all item groups
        const groupResult = await mongoose.connection.collection('itemgroups').deleteMany({});
        console.log(`Deleted ${groupResult.deletedCount} item groups.`);

        console.log('Successfully cleared Items and Item Groups.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

deleteAll();
