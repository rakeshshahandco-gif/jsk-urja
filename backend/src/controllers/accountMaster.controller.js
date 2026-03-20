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

export default {
    initializeMasters,
    getGroups,
    createGroup,
    getLedgers,
    createLedger
};
