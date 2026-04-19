import { catchAsync } from '../utils/catchAsync.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { initializeAccountingMasters } from '../utils/accountInitializer.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { Supplier } from '../models/supplier.model.js';
import { GlobalRenamer } from '../utils/GlobalRenamer.js';
import pick from '../utils/pick.js';

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
    const filters = pick(req.query, ['underGroup', 'type', 'isCustomer', 'isSupplier', 'isBank', 'isCashLedger']);
    const ledgers = await AccountLedger.find(filters).populate('underGroup', 'name').sort({ name: 1 });
    res.status(200).send(new ApiResponse(200, ledgers, 'Ledgers fetched successfully'));
});

const createLedger = catchAsync(async (req, res) => {
    const body = { ...req.body, createdBy: req.user._id };

    // Check if being created under Sundry Creditors
    let isSundryCreditor = false;
    if (body.underGroup) {
        const grp = await AccountGroup.findById(body.underGroup).lean();
        if (grp && grp.name === 'Sundry Creditors') {
            isSundryCreditor = true;
            body.type = 'Supplier';
            body.isSupplier = true;
        }
    }

    // Set initial currentBalance based on Opening Balance sign
    const opBal = Number(body.openingBalance) || 0;
    body.currentBalance = (body.drCr === 'Cr') ? -opBal : opBal;

    const ledger = await AccountLedger.create(body);

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

    const ledger = await AccountLedger.findByIdAndUpdate(
        req.params.id,
        { ...updateData },
        { new: true, runValidators: true }
    ).populate('underGroup', 'name');
    if (!ledger) return res.status(404).send(new ApiResponse(404, null, 'Ledger not found'));

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
    deleteLedger
};
