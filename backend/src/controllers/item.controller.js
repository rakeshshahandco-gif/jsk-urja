import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Item } from '../models/item.model.js';

// ── Auto-generate item code ─────────────────────────────────────────────────
const generateItemCode = async (itemType = 'ITEM') => {
    const prefix = {
        ELECTRICAL: 'JSK-EL',
        PCB: 'JSK-PCB',
        HOUSING: 'JSK-HSG',
        IC: 'JSK-IC',
        RESISTOR: 'JSK-RES',
        CAPACITOR: 'JSK-CAP',
        TRANSFORMER: 'JSK-TRF',
        WIRE: 'JSK-WR',
        PACKAGING: 'JSK-PKG',
        FINISHED_PRODUCT: 'JSK-FP',
        OTHER: 'JSK-ITM',
    }[itemType] || 'JSK-ITM';

    const count = await Item.countDocuments();
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

// ── CREATE ──────────────────────────────────────────────────────────────────
export const createItem = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user.id };

    // Auto-generate code if not provided
    if (!data.itemCode || String(data.itemCode).trim() === '') {
        data.itemCode = await generateItemCode(data.itemType);
    } else {
        data.itemCode = String(data.itemCode).trim().toUpperCase();
    }

    // Check unique code
    const exists = await Item.findOne({ itemCode: data.itemCode });
    if (exists) throw new ApiError(httpStatus.CONFLICT, `Item code "${data.itemCode}" already exists`);

    // Seed currentStock from openingStock
    data.currentStock = data.openingStock ?? 0;

    const item = await Item.create(data);
    res.status(httpStatus.CREATED).send({ success: true, data: item });
});

// ── LIST ────────────────────────────────────────────────────────────────────
export const getItems = asyncHandler(async (req, res) => {
    const {
        search, itemCategory, itemType, isActive,
        page = 1, limit = 25, sortBy = 'itemName:asc'
    } = req.query;

    console.log('GET /items query:', req.query);

    const filter = {};
    if (itemCategory) filter.itemCategory = itemCategory;
    if (itemType) filter.itemType = itemType;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    if (search) {
        // Handle concatenated string formats like "Code — Name" or "Code - Name"
        const searchParts = search.split(/\s+[—\-]\s+/).map(s => s.trim()).filter(Boolean);

        if (searchParts.length > 1) {
            filter.$or = [
                { itemCode: { $regex: searchParts[0], $options: 'i' } },
                { itemName: { $regex: searchParts[1], $options: 'i' } }
            ];
        } else {
            const isNumeric = /^\d+$/.test(search.trim());

            if (isNumeric) {
                // ── Smart Numeric Search (e.g., "20") ──
                // Prevents matching "120.3" or "1206" when searching for "20"
                const num = search.trim();
                filter.$or = [
                    // Code matches: Ends with the number (e.g., I00020, JSK-20)
                    { itemCode: { $regex: `(?:^|\\D)0*${num}$`, $options: 'i' } },
                    // Name matches: Whole number match (e.g., "20mm", but NOT "120")
                    { itemName: { $regex: `(^|[^0-9])${num}([^0-9]|$)`, $options: 'i' } },
                    // HSN matches: Contains the number
                    { hsnCode: { $regex: num, $options: 'i' } },
                ];
            } else {
                const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const standardRegex = { $regex: safeSearch, $options: 'i' };

                filter.$or = [
                    { itemName: standardRegex },
                    { itemCode: standardRegex },
                    { hsnCode: standardRegex },
                ];

                // ── Fuzzy Alphanumeric Search for Item Codes (e.g., "I20" -> /I.*20/i) ──
                const fuzzyMatch = search.trim().match(/^([a-zA-Z\s\-_]+)(\d+)$/);
                if (fuzzyMatch) {
                    const alpha = fuzzyMatch[1].replace(/[\s\-_]/g, '');
                    const num = fuzzyMatch[2];
                    if (alpha && num) {
                        filter.$or.push({
                            itemCode: { $regex: `${alpha}.*${num}`, $options: 'i' }
                        });
                    }
                }
            }
        }
    }

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(parseInt(limit, 10), 200);
    const skip = (pageNum - 1) * limitNum;

    const [field, dir] = sortBy.split(':');
    const sortField = field || 'itemName';
    const sortDir = dir === 'desc' ? -1 : 1;
    const sort = { [sortField]: sortDir };

    const [items, total] = await Promise.all([
        Item.find(filter)
            .collation({ locale: 'en', numericOrdering: true })
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean(),
        Item.countDocuments(filter),
    ]);

    res.send({
        success: true,
        data: items,
        meta: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
});

// ── SINGLE ──────────────────────────────────────────────────────────────────
export const getItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    res.send({ success: true, data: item });
});

// ── UPDATE ──────────────────────────────────────────────────────────────────
export const updateItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');

    // Prevent changing itemCode to one that already exists
    if (req.body.itemCode && req.body.itemCode !== item.itemCode) {
        const clash = await Item.findOne({ itemCode: req.body.itemCode.toUpperCase() });
        if (clash) throw new ApiError(httpStatus.CONFLICT, `Item code "${req.body.itemCode}" already in use`);
    }

    if (req.body.openingStock !== undefined) {
        const newOpeningStock = Number(req.body.openingStock);
        if (newOpeningStock !== item.openingStock) {
            const diff = newOpeningStock - (item.openingStock || 0);
            item.currentStock = (item.currentStock || 0) + diff;
        }
    }

    Object.assign(item, req.body);
    item.updatedBy = req.user.id;
    await item.save();
    res.send({ success: true, data: item });
});

// ── DELETE (soft) ────────────────────────────────────────────────────────────
export const deleteItem = asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Item not found');
    item.isActive = false;
    item.updatedBy = req.user.id;
    await item.save();
    res.send({ success: true, message: 'Item deactivated successfully' });
});

// ── GENERATE CODE (utility endpoint) ────────────────────────────────────────
export const generateCode = asyncHandler(async (req, res) => {
    const code = await generateItemCode(req.query.itemType || 'OTHER');
    res.send({ success: true, data: { itemCode: code } });
});
