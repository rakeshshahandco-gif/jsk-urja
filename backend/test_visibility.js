import mongoose from 'mongoose';
import reportService from './src/services/report.service.js';

async function run() {
    await mongoose.connect('mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true');
    console.log('Connected to DB');

    // Simulate Rajeshree Gurav
    const filters = {
        user: { id: '69900c31437f60b9e22750c5', role: 'manager' },
        tab: 'UPCOMING'
    };

    const res = await reportService.queryManageTasks(filters, { limit: 100 });
    console.log(`Found ${res.data.length} tasks for Rajeshree.`);

    // print titles of first 5
    res.data.slice(0, 5).forEach(t => console.log('Task:', t.title, 'Assignees:', t.assigneeIds.map(a => a.name)));

    process.exit(0);
}

run().catch(console.error);
