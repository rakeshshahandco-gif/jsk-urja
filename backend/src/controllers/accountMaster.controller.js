import { catchAsync } from '../utils/catchAsync.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { initializeAccountingMasters } from '../utils/accountInitializer.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Voucher } from '../models/voucher.model.js';
import { GlobalRenamer } from '../utils/GlobalRenamer.js';
import pick from '../utils/pick.js';
import {
    getAccountGroupChain,
    classifyFromGroupChain,
    deriveLedgerFieldsFromClassification,
    isCreditorRole,
} from '../utils/ledgerClassification.utils.js';

async function applyGroupDerivedClassification(body) {
    if (!body?.underGroup) return { isCreditor: false, classification: null };
    const chain = await getAccountGroupChain(body.underGroup);
    const classification = classifyFromGroupChain(chain);
    const derived = deriveLedgerFieldsFromClassification(classification);
    body.groupName = derived.groupName;
    body.type = derived.type;
    body.isSupplier = !!derived.isSupplier;
    body.isCustomer = !!derived.isCustomer;
    body.isBank = !!derived.isBank;
    body.isCashLedger = !!derived.isCashLedger;
    body.isTaxLedger = !!derived.isTaxLedger;
    if (Object.prototype.hasOwnProperty.call(derived, 'expenseCategory')) {
        body.expenseCategory = derived.expenseCategory;
    }
    return { isCreditor: isCreditorRole(classification.role), classification };
}

async function linkExistingSupplierIfNeeded(ledger) {
    if (!ledger?.isSupplier || ledger.referenceId) return;
    try {
        const nameRe = new RegExp(
            `^\\s*${String(ledger.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
            'i',
        );
        const supplier = await Supplier.findOne({ supplierName: nameRe }).select('_id').lean();
        if (supplier) {
            await AccountLedger.findByIdAndUpdate(ledger._id, {
                referenceId: supplier._id,
                referenceModel: 'Supplier',
            });
            if (!supplier.ledgerId) {
                await Supplier.findByIdAndUpdate(supplier._id, { ledgerId: ledger._id });
            }
        }
    } catch (err) {
        console.error('⚠️ Link existing Supplier from Ledger failed:', err.message);
    }
}

const initializeMasters = catchAsync(async (req, res) => {
    const result = await initializeAccountingMasters(req.user._id);
    res.status(200).send(new ApiResponse(200, result, 'Accounting masters initialized successfully'));
});

const getGroups = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['nature', 'parentGroup', 'isActive']);
    const groups = await AccountGroup.find(filters).populate('parentGroup', 'name').sort({ sortOrder: 1, name: 1 });
    res.status(200).send(new ApiResponse(200, groups, 'Groups fetched successfully'));
});

const createGroup = catchAsync(async (req, res) => {
    const group = await AccountGroup.create({
        ...req.body,
        createdBy: req.user._id
    });
    res.status(201).send(new ApiResponse(201, group, 'Group created successfully'));
});

const getLedgers = catchAsync(async (req, res) => {
    const { search, underGroup, type, isCustomer, isSupplier, isBank, isCashLedger } = req.query;
    const filters = pick(req.query, ['underGroup', 'type', 'isCustomer', 'isSupplier', 'isBank', 'isCashLedger']);
    
    if (search) {
        filters.name = { $regex: search, $options: 'i' };
    }
    
    const ledgers = await AccountLedger.find(filters).populate('underGroup', 'name').sort({ name: 1 });
    res.status(200).send(new ApiResponse(200, ledgers, 'Ledgers fetched successfully'));
});

const createLedger = catchAsync(async (req, res) => {
    const body = { ...req.body, createdBy: req.user._id };

    if (body.tdsApplicable && !String(body.tdsSection || '').trim()) {
        return res.status(400).send(new ApiResponse(400, null, 'When TDS Applicable is ON, TDS Section must be selected'));
    }

    const { isCreditor: isSundryCreditor } = await applyGroupDerivedClassification(body);

    // Set initial currentBalance based on Opening Balance sign
    const opBal = Number(body.openingBalance) || 0;
    body.currentBalance = (body.drCr === 'Cr') ? -opBal : opBal;

    const ledger = await AccountLedger.create(body);

    // Prefer linking an existing Supplier master; create only when none matches
    if (isSundryCreditor && !body.referenceId) {
        await linkExistingSupplierIfNeeded(ledger);
        const refreshed = await AccountLedger.findById(ledger._id).lean();
        if (refreshed?.referenceId) {
            return res.status(201).send(new ApiResponse(201, refreshed, 'Ledger created successfully'));
        }
    }

    // Auto-create / link Supplier master when ledger is under Sundry Creditors
    if (isSundryCreditor && !body.referenceId) {
        try {
            // Build a unique supplier code
            const lastSup = await Supplier.findOne({ supplierCode: { $regex: /^SUP-\d+$/i } }).sort({ createdAt: -1 });
            let nextNum = 1;
            if (lastSup?.supplierCode) {
                const n = parseInt(lastSup.supplierCode.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(n)) nextNum = n + 1;
            }
            const supplierCode = `SUP-${String(nextNum).padStart(4, '0')}`;

            const supplier = await Supplier.create({
                supplierName: ledger.name,
                supplierCode,
                contactPerson: ledger.contactPerson || '',
                phone: ledger.mobile || '',
                email: ledger.email || '',
                address: ledger.address || '',
                city: ledger.city || '',
                state: ledger.state || '',
                pincode: ledger.pincode || '',
                gstNumber: ledger.gstin || '',
                panNumber: ledger.pan || '',
                bankName: ledger.bankName || '',
                bankAccountNo: ledger.accountNo || '',
                bankIfsc: ledger.ifsc || '',
                openingBalance: ledger.openingBalance || 0,
                openingBalanceDrCr: ledger.drCr || 'Cr',
                createdBy: req.user._id,
            });

            // Cross-link ledger back to supplier
            await AccountLedger.findByIdAndUpdate(ledger._id, {
                referenceId: supplier._id,
                referenceModel: 'Supplier'
            });
        } catch (err) {
            console.error('⚠️ Auto-create Supplier from Ledger failed:', err.message);
        }
    }

    res.status(201).send(new ApiResponse(201, ledger, 'Ledger created successfully'));
});

const getGroupById = catchAsync(async (req, res) => {
    const group = await AccountGroup.findById(req.params.id).populate('parentGroup', 'name');
    if (!group) {
        return res.status(404).send(new ApiResponse(404, null, 'Group not found'));
    }
    res.status(200).send(new ApiResponse(200, group));
});

const updateGroup = catchAsync(async (req, res) => {
    const group = await AccountGroup.findByIdAndUpdate(
        req.params.id,
        { ...req.body },
        { new: true, runValidators: true }
    ).populate('parentGroup', 'name');
    if (!group) {
        return res.status(404).send(new ApiResponse(404, null, 'Group not found'));
    }
    res.status(200).send(new ApiResponse(200, group, 'Group updated successfully'));
});

const deleteGroup = catchAsync(async (req, res) => {
    // Prevent deletion if ledgers or subgroups exist under this group
    const childCount = await AccountGroup.countDocuments({ parentGroup: req.params.id });
    const ledgerCount = await AccountLedger.countDocuments({ underGroup: req.params.id });
    if (childCount > 0 || ledgerCount > 0) {
        return res.status(400).send(
            new ApiResponse(400, null, `Cannot delete: ${childCount} sub-group(s) and ${ledgerCount} ledger(s) exist under this group.`)
        );
    }
    await AccountGroup.findByIdAndDelete(req.params.id);
    res.status(200).send(new ApiResponse(200, null, 'Group deleted successfully'));
});

const updateLedger = catchAsync(async (req, res) => {
    const updateData = { ...req.body };

    const oldLedger = await AccountLedger.findById(req.params.id);
    if (!oldLedger) return res.status(404).send(new ApiResponse(404, null, 'Ledger not found'));

    const ugChanging = Object.prototype.hasOwnProperty.call(updateData, 'underGroup')
        && String(updateData.underGroup || '') !== String(oldLedger.underGroup || '');

    // Central Master Alteration gate for Ledger Group (Category B)
    if (ugChanging) {
        const { buildImpactPreview, applyMasterAlteration } = await import('../services/masterAlteration/index.js');
        if (!req.body.confirmMasterAlteration) {
            const preview = await buildImpactPreview({
                masterType: 'Ledger',
                masterId: req.params.id,
                proposedChanges: { underGroup: updateData.underGroup },
                companyId: req.companyId || oldLedger.companyId,
                effectiveFrom: req.body.effectiveFrom || null,
            });
            return res.status(409).send(
                new ApiResponse(
                    409,
                    { requiresImpactPreview: true, preview },
                    preview.blockReason || 'Impact Preview required before Ledger Group alteration',
                ),
            );
        }
        const result = await applyMasterAlteration({
            masterType: 'Ledger',
            masterId: req.params.id,
            proposedChanges: { underGroup: updateData.underGroup, ...(updateData.name ? { name: updateData.name } : {}) },
            companyId: req.companyId || oldLedger.companyId,
            user: req.user,
            reason: req.body.reason || req.body._masterAlterationReason || '',
            effectiveFrom: req.body.effectiveFrom || null,
            confirmApply: true,
            ipAddress: req.ip,
            userAgent: req.get?.('user-agent'),
        });
        return res.status(200).send(new ApiResponse(200, result.master, result.message || 'Ledger group updated via Master Alteration'));
    }

    if (oldLedger.isTdsPayableLedger) {
        const secChanging = Object.prototype.hasOwnProperty.call(updateData, 'tdsPayableSectionCode')
            && String(updateData.tdsPayableSectionCode || '').toUpperCase()
                !== String(oldLedger.tdsPayableSectionCode || '').toUpperCase();
        if (secChanging) {
            const used = await Voucher.countDocuments({
                status: { $ne: 'Cancelled' },
                items: { $elemMatch: { ledgerId: oldLedger._id } },
            });
            if (used > 0 && !req.body.confirmTdsPayableMetaChange) {
                return res.status(400).send(
                    new ApiResponse(
                        400,
                        null,
                        'This TDS payable ledger has posted vouchers. Confirm to change group or TDS section code, or edit only name / display name / status.',
                    ),
                );
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'tdsApplicable') || Object.prototype.hasOwnProperty.call(updateData, 'tdsSection')) {
        const mergedApplicable =
            updateData.tdsApplicable !== undefined ? updateData.tdsApplicable : oldLedger.tdsApplicable;
        const mergedSection = updateData.tdsSection !== undefined ? updateData.tdsSection : oldLedger.tdsSection;
        if (mergedApplicable && !String(mergedSection || '').trim()) {
            return res.status(400).send(new ApiResponse(400, null, 'When TDS Applicable is ON, TDS Section must be selected'));
        }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'openingBalance') || Object.prototype.hasOwnProperty.call(updateData, 'drCr')) {
        if (oldLedger) {
            const newOpBal = Number(updateData.openingBalance ?? oldLedger.openingBalance) || 0;
            const newDrCr = updateData.drCr ?? oldLedger.drCr;
            const newSignedOpBal = (newDrCr === 'Cr') ? -newOpBal : newOpBal;
            
            const oldSignedOpBal = (oldLedger.drCr === 'Cr') ? -oldLedger.openingBalance : oldLedger.openingBalance;
            
            // Adjust currentBalance by the difference in opening balance
            updateData.currentBalance = (oldLedger.currentBalance || 0) - oldSignedOpBal + newSignedOpBal;
        }
    }

    // Always re-derive type/flags/groupName from underGroup (fixes stale Expense→Creditor moves)
    const underGroupForSync = updateData.underGroup ?? oldLedger.underGroup;
    if (underGroupForSync) {
        const syncBody = { underGroup: underGroupForSync };
        await applyGroupDerivedClassification(syncBody);
        updateData.groupName = syncBody.groupName;
        updateData.type = syncBody.type;
        updateData.isSupplier = syncBody.isSupplier;
        updateData.isCustomer = syncBody.isCustomer;
        updateData.isBank = syncBody.isBank;
        updateData.isCashLedger = syncBody.isCashLedger;
        updateData.isTaxLedger = syncBody.isTaxLedger;
        if (Object.prototype.hasOwnProperty.call(syncBody, 'expenseCategory')) {
            updateData.expenseCategory = syncBody.expenseCategory;
        }
    }

    const ledger = await AccountLedger.findByIdAndUpdate(
        req.params.id,
        { ...updateData },
        { new: true, runValidators: true }
    ).populate('underGroup', 'name');
    if (!ledger) return res.status(404).send(new ApiResponse(404, null, 'Ledger not found'));

    if (ledger.isSupplier && !ledger.referenceId) {
        await linkExistingSupplierIfNeeded(ledger);
    }

    // Sync changes back to linked Supplier master
    if (ledger.referenceId && ledger.referenceModel === 'Supplier') {
        try {
            await Supplier.findByIdAndUpdate(ledger.referenceId, {
                supplierName: ledger.name,
                contactPerson: ledger.contactPerson || '',
                phone: ledger.mobile || '',
                email: ledger.email || '',
                address: ledger.address || '',
                city: ledger.city || '',
                state: ledger.state || '',
                pincode: ledger.pincode || '',
                gstNumber: ledger.gstin || '',
                panNumber: ledger.pan || '',
                bankName: ledger.bankName || '',
                bankAccountNo: ledger.accountNo || '',
                bankIfsc: ledger.ifsc || '',
            });
        } catch (err) {
            console.error('⚠️ Failed to sync Supplier from Ledger update:', err.message);
        }
    }

    // Sync changes back to linked Customer master
    if (ledger.referenceId && ledger.referenceModel === 'Customer') {
        try {
            const CustomerModel = (await import('../models/customer.model.js')).default;
            await CustomerModel.findByIdAndUpdate(ledger.referenceId, {
                customerName: ledger.name,
                company: ledger.name, // Keep company name in sync with ledger name
                address: ledger.address || '',
                city: ledger.city || '',
                state: ledger.state || '',
                pincode: ledger.pincode || '',
                gstNumber: ledger.gstin || '',
            });
        } catch (err) {
            console.error('⚠️ Failed to sync Customer from Ledger update:', err.message);
        }
    }

    // Propagate name change if needed
    if (oldLedger.name !== ledger.name) {
        GlobalRenamer.propagate({
            masterType: 'LEDGER',
            id: ledger._id,
            oldName: oldLedger.name,
            newName: ledger.name,
            userId: req.user._id
        }).catch(err => console.error('Global Propagation Error (Ledger):', err));
    }

    res.status(200).send(new ApiResponse(200, ledger, 'Ledger updated successfully'));
});

const deleteLedger = catchAsync(async (req, res) => {
    await AccountLedger.findByIdAndDelete(req.params.id);
    res.status(200).send(new ApiResponse(200, null, 'Ledger deleted successfully'));
});

const linkEntityLedger = catchAsync(async (req, res) => {
    const { entityId, entityType, ledgerId } = req.body;
    
    if (!entityId || !entityType || !ledgerId) {
        return res.status(400).send(new ApiResponse(400, null, 'Entity ID, Entity Type and Ledger ID are required'));
    }

    const ledger = await AccountLedger.findById(ledgerId);
    if (!ledger) return res.status(404).send(new ApiResponse(404, null, 'Ledger not found'));

    if (entityType === 'Customer') {
        const CustomerModel = (await import('../models/customer.model.js')).default;
        await CustomerModel.findByIdAndUpdate(entityId, { ledgerId });
    } else if (entityType === 'Supplier') {
        await Supplier.findByIdAndUpdate(entityId, { ledgerId });
    } else {
        return res.status(400).send(new ApiResponse(400, null, 'Invalid entity type'));
    }

    // Bi-directional link
    await AccountLedger.findByIdAndUpdate(ledgerId, {
        referenceId: entityId,
        referenceModel: entityType
    });

    res.status(200).send(new ApiResponse(200, null, 'Ledger linked successfully'));
});

export default {
    initializeMasters,
    getGroups,
    createGroup,
    getGroupById,
    updateGroup,
    deleteGroup,
    getLedgers,
    createLedger,
    updateLedger,
    deleteLedger,
    linkEntityLedger
};
