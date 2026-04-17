import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Complaint } from '../src/models/complaint.model.js';
import { RepairJobCard } from '../src/models/repairJobCard.model.js';
import { syncComplaintStatus } from '../src/controllers/complaint.controller.js';

dotenv.config();

const fix = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const complaints = await Complaint.find({ customerName: /Akshar/i });
        console.log(`Found ${complaints.length} complaints for Akshar`);

        for (const complaint of complaints) {
            console.log(`\nChecking ${complaint.complaintNo}...`);

            // 1. Delete EMPTY job cards
            const emptyDeleted = await RepairJobCard.deleteMany({ 
                complaintId: complaint._id,
                'items.0': { $exists: false }
            });
            console.log(`Deleted ${emptyDeleted.deletedCount} empty job cards.`);

            // 2. Auto-Resolve Job Cards with Repaired Qty > 0
            const jcs = await RepairJobCard.find({ complaintId: complaint._id });
            for (const jc of jcs) {
                const totalRepaired = jc.items.reduce((s, i) => s + (i.repairedQty || 0), 0);
                if (totalRepaired > 0 && jc.status !== 'Repaired') {
                    jc.status = 'Repaired';
                    await jc.save();
                    console.log(`Auto-marked ${jc.jobCardNo} as Repaired (Found ${totalRepaired} items).`);
                }
            }

            // 3. If no Job Cards left but items were received, create a proper one
            const remainingJCs = await RepairJobCard.countDocuments({ complaintId: complaint._id });
            if (remainingJCs === 0 && complaint.status === 'Faulty Fully Received') {
                 // Create proper JC
                 const jcItems = complaint.items.map(i => ({
                    itemId: i.itemId,
                    itemCode: i.itemCode,
                    itemName: i.itemName,
                    uom: i.uom || 'NOS',
                    qtyReceivedForRepair: i.faultyReceivedQty || 1,
                    repairedQty: i.faultyReceivedQty || 1,
                    repairResult: 'Repaired'
                }));
                const jcNo = `JC-FIX-A-${Date.now().toString().slice(-4)}`;
                await RepairJobCard.create({
                    jobCardNo: jcNo,
                    date: new Date(),
                    complaintId: complaint._id,
                    complaintNo: complaint.complaintNo,
                    status: 'Repaired',
                    items: jcItems,
                    financialYear: '2026-2027'
                });
                console.log(`Generated fresh Job Card for empty complaint ${complaint.complaintNo}`);
            }

            // 4. Final Sync
            await syncComplaintStatus(complaint._id);
            const final = await Complaint.findById(complaint._id);
            console.log(`Final Status of ${complaint.complaintNo}: ${final.status}`);
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

fix();
