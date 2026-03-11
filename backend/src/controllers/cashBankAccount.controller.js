import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { CashBankAccount } from '../models/cashBankAccount.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';

export const createAccount = asyncHandler(async (req, res) => {
    const { accountName, accountType } = req.body;

    const existing = await CashBankAccount.findOne({ accountName });
    if (existing) throw new ApiError(httpStatus.BAD_REQUEST, 'Account name already exists');

    const account = await CashBankAccount.create({
        ...req.body,
        currentBalance: req.body.openingBalance || 0,
        createdBy: req.user.id
    });

    // Create a corresponding Ledger in the Chart of Accounts
    await AccountLedger.create({
        name: account.accountName,
        group: accountType === 'Cash' ? 'Current Assets' : 'Current Assets', // Both are current assets generally
        type: accountType,
        referenceId: account._id,
        referenceModel: 'CashBankAccount',
        openingBalance: account.openingBalance,
        currentBalance: account.openingBalance,
        createdBy: req.user.id
    });

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, account, 'Account created successfully'));
});

export const getAccounts = asyncHandler(async (req, res) => {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.accountType = type;

    const accounts = await CashBankAccount.find(filter).sort({ accountName: 1 });
    res.send(new ApiResponse(httpStatus.OK, accounts));
});

export const updateAccount = asyncHandler(async (req, res) => {
    const account = await CashBankAccount.findById(req.params.id);
    if (!account) throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');

    const oldName = account.accountName;
    Object.assign(account, req.body);
    account.updatedBy = req.user.id;
    await account.save();

    // Update linked ledger name if it changed
    if (req.body.accountName && req.body.accountName !== oldName) {
        await AccountLedger.findOneAndUpdate(
            { referenceId: account._id, referenceModel: 'CashBankAccount' },
            { name: req.body.accountName }
        );
    }

    res.send(new ApiResponse(httpStatus.OK, account, 'Account updated successfully'));
});

export const deleteAccount = asyncHandler(async (req, res) => {
    const account = await CashBankAccount.findById(req.params.id);
    if (!account) throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');

    // Check if any transactions exist (future check)

    await account.deleteOne();
    await AccountLedger.deleteOne({ referenceId: account._id, referenceModel: 'CashBankAccount' });

    res.send(new ApiResponse(httpStatus.OK, null, 'Account deleted successfully'));
});
