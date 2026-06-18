import { Supplier } from '../../models/supplier.model.js';
import { Item } from '../../models/item.model.js';
import { AccountLedger } from '../../models/accountLedger.model.js';
import Customer from '../../models/customer.model.js';
import { autoLinkEntityLedger, normalizeName } from '../../utils/ledgerLinking.utils.js';
import {
    normalizeGstin,
    panFromGstin,
    stripLegalSuffix,
    matchPartyByPriority,
    buildRegexExact,
    buildRegexContains,
} from '../importUtility/ledgerMatch.service.js';

const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export { normalizeGstin };

async function findSupplierByGstin(gst) {
    if (!gst) return null;
    const normalized = normalizeGstin(gst);
    let supplier = await Supplier.findOne({ gstNumber: normalized, isDeleted: { $ne: true } }).lean();
    if (supplier) return { supplier, method: 'gstin' };

    supplier = await Supplier.findOne({
        gstNumber: new RegExp(`^${esc(normalized)}$`, 'i'),
        isDeleted: { $ne: true },
    }).lean();
    if (supplier) return { supplier, method: 'gstin' };

    supplier = await Supplier.findOne({
        gstNumber: new RegExp(esc(normalized), 'i'),
        isDeleted: { $ne: true },
    }).lean();
    if (supplier) return { supplier, method: 'gstin' };

    const ledger = await AccountLedger.findOne({
        gstin: new RegExp(`^${esc(gst)}$`, 'i'),
        $or: [{ type: 'Supplier' }, { isSupplier: true }],
    }).lean();
    if (ledger?.referenceId) {
        supplier = await Supplier.findOne({ _id: ledger.referenceId, isDeleted: { $ne: true } }).lean();
        if (supplier) return { supplier, method: 'ledger_gstin', ledger };
    }
    return null;
}

async function findSupplierByPan(pan) {
    if (!pan) return null;
    let supplier = await Supplier.findOne({
        panNumber: buildRegexExact(pan),
        isDeleted: { $ne: true },
    }).lean();
    if (supplier) return { supplier, method: 'pan' };

    const ledger = await AccountLedger.findOne({
        pan: buildRegexExact(pan),
        $or: [{ type: 'Supplier' }, { isSupplier: true }],
    }).lean();
    if (ledger?.referenceId) {
        supplier = await Supplier.findOne({ _id: ledger.referenceId, isDeleted: { $ne: true } }).lean();
        if (supplier) return { supplier, method: 'ledger_pan', ledger };
    }
    return null;
}

async function findSupplierByName(name, requireGstEmpty = false) {
    const supplierName = String(name || '').trim();
    if (!supplierName) return null;

    const exact = await Supplier.findOne({
        supplierName: new RegExp(`^${esc(supplierName)}$`, 'i'),
        isDeleted: { $ne: true },
    }).lean();
    if (exact) return { supplier: exact, method: 'name_exact' };

    const core = stripLegalSuffix(supplierName);
    if (core.length >= 3) {
        const fuzzy = await Supplier.findOne({
            supplierName: new RegExp(esc(core), 'i'),
            isDeleted: { $ne: true },
        }).lean();
        if (fuzzy) return { supplier: fuzzy, method: 'name_fuzzy' };
    }

    const target = normalizeName(supplierName);
    const candidates = await Supplier.find({ isDeleted: { $ne: true } })
        .select('supplierName gstNumber ledgerId')
        .limit(3000)
        .lean();
    for (const row of candidates) {
        if (normalizeName(row.supplierName) === target) {
            return { supplier: row, method: 'name_normalized' };
        }
    }

    if (requireGstEmpty) return null;

    const ledger = await AccountLedger.findOne({
        name: new RegExp(`^${esc(supplierName)}$`, 'i'),
        $or: [{ type: 'Supplier' }, { isSupplier: true }],
    }).lean();
    if (ledger?.referenceId) {
        const linked = await Supplier.findOne({ _id: ledger.referenceId, isDeleted: { $ne: true } }).lean();
        if (linked) return { supplier: linked, method: 'ledger_name', ledger };
    }
    return null;
}

export async function resolveSupplierFromExtract(ex, companyId = null) {
    const gst = normalizeGstin(ex?.supplierGstin);
    const name = String(ex?.supplierName || ex?.vendorName || '').trim();

    if (companyId && name) {
        const { findLearnedMapping } = await import('../importCenter/importLearning.service.js');
        const learned = await findLearnedMapping(companyId, 'supplier', name);
        if (learned?.entityId) {
            const supplier = await Supplier.findOne({ _id: learned.entityId, isDeleted: { $ne: true } }).lean();
            if (supplier) {
                return {
                    supplier,
                    matchMethod: 'learned',
                    nameMismatch: false,
                    ledgerId: supplier.ledgerId || null,
                };
            }
        }
    }

    const matched = await matchPartyByPriority({
        gstin: gst,
        name,
        findByGstin: async (g) => {
            const hit = await findSupplierByGstin(g);
            return hit ? { entity: hit, matchMethod: hit.method } : null;
        },
        findByPan: async (p) => {
            const hit = await findSupplierByPan(p);
            return hit ? { entity: hit, matchMethod: hit.method } : null;
        },
        findByExactName: async (n) => {
            const hit = await findSupplierByName(n, false);
            if (!hit?.supplier) return null;
            return { entity: hit, matchMethod: hit.method };
        },
        findByFuzzyName: async (n) => {
            const core = stripLegalSuffix(n);
            if (core.length < 3) return null;
            const fuzzy = await Supplier.findOne({
                supplierName: buildRegexContains(core),
                isDeleted: { $ne: true },
            }).lean();
            if (!fuzzy) return null;
            return { entity: { supplier: fuzzy, method: 'name_fuzzy' }, matchMethod: 'name_fuzzy' };
        },
    });

    const hit = matched.entity;
    if (hit?.supplier) {
        const masterGst = normalizeGstin(hit.supplier.gstNumber);
        const nameMismatch = name && hit.supplier.supplierName
            && normalizeName(hit.supplier.supplierName) !== normalizeName(name);
        const gstMismatch = gst && masterGst && masterGst !== gst;
        return {
            supplier: hit.supplier,
            matchMethod: matched.matchMethod || hit.method,
            nameMismatch,
            gstMismatch,
            ledgerId: hit.ledger?._id || hit.supplier.ledgerId || null,
        };
    }

    return { supplier: null, matchMethod: null, nameMismatch: false, gstMismatch: false, ledgerId: null };
}

/** Build pending supplier draft payload from OCR extract (no DB write). */
export function buildPendingSupplierPayload(ex, companyId, financialYear) {
    const gst = normalizeGstin(ex?.supplierGstin);
    const pan = panFromGstin(gst) || '';
    const stateCode = gst.length >= 2 ? gst.substring(0, 2) : '';
    return {
        type: 'supplier',
        status: 'pending',
        payload: {
            supplierName: String(ex?.supplierName || '').trim() || `Supplier ${gst || 'Draft'}`,
            gstNumber: gst,
            panNumber: pan,
            state: ex?.placeOfSupply || ex?.supplierState || stateCode,
            address: ex?.supplierAddress || '',
            gstApplicable: true,
            registrationType: 'Registered',
            ledgerGroup: 'Sundry Creditors',
            source: 'Scan Invoice OCR',
            companyId,
            financialYear,
        },
        createdAt: new Date(),
    };
}

export async function ensureSupplierLedger(supplierDoc) {
    if (!supplierDoc?._id) return null;
    const supplier = await Supplier.findById(supplierDoc._id);
    if (!supplier) return null;
    const ledgerId = await autoLinkEntityLedger(supplier, 'Supplier');
    if (ledgerId && String(supplier.ledgerId) !== String(ledgerId)) {
        supplier.ledgerId = ledgerId;
        await supplier.save();
    }
    return ledgerId || supplier.ledgerId || null;
}

export async function findItemMaster(row) {
    const itemName = String(row?.itemName || row?.ocrItemName || '').trim();
    const itemCode = String(row?.itemCode || row?.ocrItemCode || '').trim().toUpperCase();
    if (!itemName && !itemCode) return null;

    if (itemCode) {
        const byCode = await Item.findOne({ itemCode, isDeleted: { $ne: true } }).lean();
        if (byCode) return { item: byCode, method: 'item_code' };
    }

    if (itemName) {
        const exact = await Item.findOne({
            itemName: new RegExp(`^${esc(itemName)}$`, 'i'),
            isDeleted: { $ne: true },
        }).lean();
        if (exact) return { item: exact, method: 'name_exact' };

        const core = stripLegalSuffix(itemName);
        if (core.length >= 4) {
            const fuzzy = await Item.findOne({
                itemName: new RegExp(`^${esc(core)}`, 'i'),
                isDeleted: { $ne: true },
            }).lean();
            if (fuzzy) return { item: fuzzy, method: 'name_fuzzy' };
        }

        try {
            const { ScanEntryItemAlias } = await import('../../models/scanEntryItemAlias.model.js');
            const alias = await ScanEntryItemAlias.findOne({
                ocrItemName: new RegExp(`^${esc(itemName)}$`, 'i'),
            }).lean();
            if (alias?.itemId) {
                const byAlias = await Item.findOne({ _id: alias.itemId, isDeleted: { $ne: true } }).lean();
                if (byAlias) return { item: byAlias, method: 'item_alias' };
            }
        } catch { /* alias lookup optional */ }
    }
    return null;
}

export async function resolveCustomerFromExtract(ex) {
    const gst = normalizeGstin(ex?.customerGstin);
    const name = String(ex?.customerName || '').trim();

    if (gst) {
        const c = await Customer.findOne({ gstNumber: gst, isDeleted: { $ne: true } }).lean()
            || await Customer.findOne({ gstNumber: new RegExp(`^${esc(gst)}$`, 'i'), isDeleted: { $ne: true } }).lean();
        if (c) return { customer: c, matchMethod: 'gstin' };
    }
    if (name && !gst) {
        const c = await Customer.findOne({ customerName: new RegExp(`^${esc(name)}$`, 'i'), isDeleted: { $ne: true } }).lean();
        if (c) return { customer: c, matchMethod: 'name_exact' };
    }
    return { customer: null, matchMethod: null };
}
