import mongoose from 'mongoose';

const tcsMasterSectionSchema = new mongoose.Schema({
    sectionCode: { type: String, required: true, trim: true, uppercase: true, unique: true },
    description: { type: String, required: true, trim: true },
    goodsOrServices: { type: String, trim: true, default: '' },
    rate: { type: Number, required: true, min: 0 },           // Normal rate %
    higherRate: { type: Number, default: 0 },                  // Rate if PAN not available (206CCA)
    thresholdAmount: { type: Number, default: 0 },             // Per transaction limit; 0 = no limit
    aggregateThreshold: { type: Number, default: 0 },          // FY cumulative limit; 0 = no limit
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

const TcsMasterSection = mongoose.model('TcsMasterSection', tcsMasterSectionSchema);
export { TcsMasterSection };
