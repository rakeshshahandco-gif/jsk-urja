import { catchAsync } from '../utils/catchAsync.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { initializeAccountingMasters } from '../utils/accountInitializer.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
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
    const ledger = await AccountLedger.create({
        ...req.body,
        createdBy: req.user._id
    });
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
    const ledger = await AccountLedger.findByIdAndUpdate(
        req.params.id,
        { ...req.body },
        { new: true, runValidators: true }
    ).populate('underGroup', 'name');
    if (!ledger) return res.status(404).send(new ApiResponse(404, null, 'Ledger not found'));
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
