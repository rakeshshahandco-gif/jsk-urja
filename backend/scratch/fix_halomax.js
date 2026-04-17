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

        const complaint = await Complaint.findOne({ customerName: /Halomax/i });
        if (!complaint) {
            console.error('Complaint not found');
            return;
        }

        console.log(`Found Complaint: ${complaint.complaintNo}`);

        // Delete ALL existing job cards for this complaint to start fresh
        const deleted = await RepairJobCard.deleteMany({ 
            complaintId: complaint._id
        });
        console.log(`Deleted ${deleted.deletedCount} existing job cards.`);

        // Create a proper job card for the 4 pieces
        const jcItems = complaint.items.map(i => ({
            itemId: i.itemId,
            itemCode: i.itemCode,
            itemName: i.itemName,
            uom: i.uom || 'NOS',
            qtyReceivedForRepair: i.qtyFaultyReported || 1,
            repairedQty: i.qtyFaultyReported || 1, // Since user says repairs are done
            repairResult: 'Repaired'
        }));

        const jcNo = `JC-FIX-${Date.now().toString().slice(-4)}`;
        const newJC = await RepairJobCard.create({
            jobCardNo: jcNo,
            date: new Date(),
            complaintId: complaint._id,
            complaintNo: complaint.complaintNo,
            status: 'Repaired',
            items: jcItems,
            financialYear: '2026-2027'
        });

        console.log(`Created proper Job Card: ${newJC.jobCardNo}`);

        // Sync Complaint Status
        await syncComplaintStatus(complaint._id);
        
        const updated = await Complaint.findById(complaint._id);
        console.log(`Final Complaint Status: ${updated.status}`);

        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

fix();
