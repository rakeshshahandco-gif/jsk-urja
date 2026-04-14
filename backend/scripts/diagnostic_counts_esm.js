import mongoose from 'mongoose';

async function checkCounts() {
    const url = 'mongodb://rakeshshahandco_db_user:5USOtAvVP2mOTt1w@ac-4ysb32t-shard-00-00.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-01.wsugxms.mongodb.net:27017,ac-4ysb32t-shard-00-02.wsugxms.mongodb.net:27017/jskurja-dev?authSource=admin&replicaSet=atlas-11qxg4-shard-0&ssl=true';
    
    try {
        await mongoose.connect(url);
        console.log('Connected to DB');

        const WorkOrder = mongoose.model('WorkOrder', new mongoose.Schema({
            status: String,
            financialYear: String
        }));

        const allDocs = await WorkOrder.find({}).lean();
        console.log('Total Work Orders in DB:', allDocs.length);

        const fyCounts = await WorkOrder.aggregate([
            { $group: { _id: { fy: '$financialYear', status: '$status' }, count: { $sum: 1 } } }
        ]);

        console.log('Counts by FY and Status:');
        fyCounts.forEach(c => {
            console.log(`${c._id.fy || '(Empty FY)'} | ${c._id.status} : ${c.count}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCounts();
