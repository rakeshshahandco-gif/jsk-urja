import { CustomerTypeMaster } from '../models/customerTypeMaster.model.js';
import { DEFAULT_CUSTOMER_TYPE_NAMES } from '../constants/sundryDebtorSettings.defaults.js';

async function ensureDefaultTypes() {
    const count = await CustomerTypeMaster.countDocuments({ isActive: true });
    if (count > 0) return;
    const docs = DEFAULT_CUSTOMER_TYPE_NAMES.map((name, idx) => ({
        name,
        sortOrder: idx,
        isActive: true,
    }));
    try {
        await CustomerTypeMaster.insertMany(docs, { ordered: false });
    } catch {
        // ignore duplicate race on parallel first requests
    }
}

export async function listCustomerTypes() {
    await ensureDefaultTypes();
    return CustomerTypeMaster.find({ isActive: true })
        .sort({ sortOrder: 1, name: 1 })
        .select('name sortOrder')
        .lean();
}

export async function createCustomerType(name, userId) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        throw new Error('Customer type name is required');
    }
    const existing = await CustomerTypeMaster.findOne({
        name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
        if (!existing.isActive) {
            existing.isActive = true;
            await existing.save();
        }
        return existing.toObject();
    }
    const maxOrder = await CustomerTypeMaster.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    const doc = await CustomerTypeMaster.create({
        name: trimmed,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        createdBy: userId,
    });
    return doc.toObject();
}
