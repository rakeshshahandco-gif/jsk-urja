import mongoose from 'mongoose';
import reminderService from './src/services/reminder.service.js';
import Reminder from './src/models/reminder.model.js';
import Customer from './src/models/customer.model.js';
import dotenv from 'dotenv';

dotenv.config();

const testFiltering = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/jsk-urja');
        console.log('Connected to MongoDB');

        // 1. Create a dummy customer
        const customer = await Customer.create({
            customerName: 'Test Filter Customer',
            company: 'Filter Test Co',
            contactPersons: [{ name: 'Test', mobile: '1234567890', isPrimary: true }]
        });

        // 2. Create an open reminder
        const openReminder = await Reminder.create({
            customerId: customer._id,
            reminderDate: new Date(),
            reminderTime: '10:00',
            followUpType: 'CALL',
            taskNote: 'This should be open',
            isClosed: false
        });

        // 3. Create a closed reminder
        const closedReminder = await Reminder.create({
            customerId: customer._id,
            reminderDate: new Date(),
            reminderTime: '11:00',
            followUpType: 'CALL',
            taskNote: 'This should be closed',
            isClosed: true,
            closedAt: new Date()
        });

        console.log('Created test reminders.');

        // 4. Test queryOpenRemindersWithDetails
        console.log('\n--- Testing queryOpenRemindersWithDetails (status: Open) ---');
        const results = await reminderService.queryOpenRemindersWithDetails({ status: 'Open' }, { limit: 10, page: 1 });
        const foundClosed = results.results.find(r => r._id.toString() === closedReminder._id.toString());
        const foundOpen = results.results.find(r => r._id.toString() === openReminder._id.toString());

        if (foundClosed) {
            console.error('❌ BUG FOUND: Closed reminder returned in "Open" status query!');
        } else {
            console.log('✅ Success: Closed reminder was filtered out.');
        }

        if (foundOpen) {
            console.log('✅ Success: Open reminder was returned.');
        } else {
            console.error('❌ Error: Open reminder was NOT returned.');
        }

        // 5. Test queryReminders (status: Open)
        console.log('\n--- Testing queryReminders (status: Open) ---');
        const results2 = await reminderService.queryReminders({ status: 'Open' }, { limit: 10, page: 1 });
        const foundClosed2 = results2.results.find(r => r._id.toString() === closedReminder._id.toString());

        if (foundClosed2) {
            console.error('❌ BUG FOUND: Closed reminder returned in queryReminders (Open)!');
        } else {
            console.log('✅ Success: Closed reminder was filtered out in queryReminders.');
        }

        // Cleanup
        await Reminder.deleteMany({ customerId: customer._id });
        await Customer.findByIdAndDelete(customer._id);
        console.log('\nCleanup complete.');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
};

testFiltering();
