
import mongoose from 'mongoose';

const nameChangeLogSchema = new mongoose.Schema({
    masterType: {
        type: String,
        required: true,
        enum: ['CUSTOMER', 'SUPPLIER', 'ITEM', 'LEDGER', 'ACCOUNT_GROUP', 'TRANSPORTER', 'EMPLOYEE']
    },
    masterId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    oldName: {
        type: String,
        required: true
    },
    newName: {
        type: String,
        required: true
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    changedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: false });

const NameChangeLog = mongoose.model('NameChangeLog', nameChangeLogSchema);
export { NameChangeLog };
