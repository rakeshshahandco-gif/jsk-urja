import mongoose from 'mongoose';

const gstImportLogSchema = new mongoose.Schema(
    {
        fileName: {
            type: String,
            required: true,
        },
        importedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        totalProcessed: {
            type: Number,
            default: 0,
        },
        totalUpdated: {
            type: Number,
            default: 0,
        },
        updates: [
            {
                customerId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Customer',
                },
                companyName: String,
                oldGst: String,
                newGst: String,
            }
        ],
        skipped: [
            {
                companyName: String,
                excelGst: String,
                reason: String,
            }
        ],
    },
    {
        timestamps: true,
    }
);

export const GSTImportLog = mongoose.model('GSTImportLog', gstImportLogSchema);
