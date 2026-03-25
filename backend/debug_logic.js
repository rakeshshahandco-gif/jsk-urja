import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        const { LedgerEntry } = await import('./src/models/ledgerEntry.model.js');
        
        const ledgerId = "69b43e3f73caad9b89392659"; // Bank of Baroda
        const filter = { ledgerId };
        
        const entries = await LedgerEntry.find(filter).sort({ date: 1, _id: 1 }).lean();
        const voucherIds = entries.map(e => e.voucherId);
        
        const relatedEntries = await LedgerEntry.find({ 
            voucherId: { $in: voucherIds }
        }).lean();

        const oppositeNamesByVoucher = {};
        
        relatedEntries.forEach(re => {
            console.log("Checking re.ledgerId", re.ledgerId.toString(), "gegen", ledgerId.toString());
            if (re.ledgerId.toString() !== ledgerId.toString()) {
                const vId = re.voucherId.toString();
                if (!oppositeNamesByVoucher[vId]) oppositeNamesByVoucher[vId] = [];
                oppositeNamesByVoucher[vId].push(re.ledgerName);
            }
        });

        const processedEntries = entries.map(entry => {
            const vId = entry.voucherId.toString();
            const oppositeName = oppositeNamesByVoucher[vId]?.join(', ') || 'Various Accounts';
            return {
                voucherNo: entry.voucherNo,
                oppositeName
            };
        });

        console.log("Processed:", processedEntries);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
};

run();
