import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Complaint } from '../src/models/complaint.model.js';
import { RepairJobCard } from '../src/models/repairJobCard.model.js';
import { syncComplaintStatus } from '../src/controllers/complaint.controller.js';

dotenv.config();

const cleanAll = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to DB');

        const customers = [/Akshar/i, /Halomax/i];

        for (const pattern of customers) {
            const complaints = await Complaint.find({ customerName: pattern });
            console.log(`\n--- Cleaning customer matching ${pattern} (${complaints.length} complaints) ---`);

            for (const complaint of complaints) {
                const jcs = await RepairJobCard.find({ complaintId: complaint._id });
                console.log(`Checking ${complaint.complaintNo} (Found ${jcs.length} job cards)`);

                for (const jc of jcs) {
                    const totalRepaired = jc.items.reduce((s, i) => s + (i.repairedQty || 0), 0);
                    const totalScrapped = jc.items.reduce((s, i) => s + (i.scrapQty || 0), 0);
                    
                    if (totalRepaired === 0 && totalScrapped === 0) {
                        await RepairJobCard.findByIdAndDelete(jc._id);
                        console.log(`   [DELETED] Empty Job Card ${jc.jobCardNo}`);
                    } else if (jc.status !== 'Repaired' && jc.status !== 'Closed') {
                        jc.status = 'Repaired';
                        await jc.save();
                        console.log(`   [UPDATED] Auto-closed ${jc.jobCardNo} (Repaired: ${totalRepaired})`);
                    }
                }

                // Final Sync
                await syncComplaintStatus(complaint._id);
                const final = await Complaint.findById(complaint._id);
                console.log(`   => Final Status of ${complaint.complaintNo}: ${final.status}`);
            }
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

cleanAll();
