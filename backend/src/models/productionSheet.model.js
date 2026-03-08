import mongoose from 'mongoose';

const psItemSchema = new mongoose.Schema({
    srNo: { type: Number },
    itemCode: { type: String, default: '' },
    modelNo: { type: String, default: '' },
    notes: { type: String, default: '' },
    voltCurrent: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    hours: { type: String, default: '' },
    dummyLoad: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
}, { _id: true });

const productionSheetSchema = new mongoose.Schema({
    soId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    soNumber: { type: String, default: '' },
    psNumber: { type: String, unique: true, trim: true }, // auto e.g. PS-2026-00001

    // Order Info (snapshot from SO)
    customerName: { type: String, default: '' },
    customerCode: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    deliveryDate: { type: Date, default: null },
    orderCategory: { type: String, default: '' },
    orderDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    modelNo: { type: String, default: '' },

    // Product Config
    stickerType: { type: String, default: '' },
    cabinetType: { type: String, default: '' },
    wires: { type: String, default: '' },
    acDc: { type: String, enum: ['AC', 'DC', 'Both', ''], default: '' },

    // Items
    items: [psItemSchema],

    // Testing Details
    testing: {
        dateTime: { type: Date, default: null },
        testedBy: { type: String, default: '' },
        set1: { type: String, default: '' },
        set2: { type: String, default: '' },
        set3: { type: String, default: '' },
        set4: { type: String, default: '' },
        comments: { type: String, default: '' },
        signature: { type: String, default: '' },
    },

    // Packing Details
    packing: {
        dateTime: { type: Date, default: null },
        handoverDateTime: { type: Date, default: null },
        deliveryDateTime: { type: Date, default: null },
        deliveryThrough: { type: String, default: '' },
        personName: { type: String, default: '' },
        comments: { type: String, default: '' },
        signature: { type: String, default: '' },
        loadReceived: { type: String, default: 'NO' },
    },

    // Load Test Details
    loadTest: {
        nlv: { type: String, default: '' },
        lv: { type: String, default: '' },
        li: { type: String, default: '' },
        trans: { type: String, default: '' },
        ex1: { type: String, default: '' },
        ex2: { type: String, default: '' },
        ex3: { type: String, default: '' },
    },

    status: { type: String, enum: ['Pending', 'In Testing', 'Ready', 'Dispatched'], default: 'Pending' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

productionSheetSchema.index({ soId: 1 });
productionSheetSchema.index({ psNumber: 1 });

const ProductionSheet = mongoose.model('ProductionSheet', productionSheetSchema);
export { ProductionSheet };
