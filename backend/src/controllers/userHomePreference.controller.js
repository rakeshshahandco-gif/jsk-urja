import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import UserHomePreference from '../models/userHomePreference.model.js';

const ROLE_DEFAULTS = {
    admin: [
        { id: 'customer-master', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 0 },
        { id: 'sales-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 1 },
        { id: 'sales-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 2 },
        { id: 'purchase-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 3 },
        { id: 'purchase-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 4 },
        { id: 'stock-ledger', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 5 }
    ],
    superadmin: [
        { id: 'customer-master', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 0 },
        { id: 'sales-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 1 },
        { id: 'sales-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 2 },
        { id: 'purchase-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 3 },
        { id: 'purchase-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 4 },
        { id: 'stock-ledger', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 5 }
    ],
    sales: [
        { id: 'customer-master', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 0 },
        { id: 'sales-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 1 },
        { id: 'sales-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 2 },
        { id: 'follow-up', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 3 },
        { id: 'manage-tasks', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 4 }
    ],
    purchase: [
        { id: 'purchase-order', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 0 },
        { id: 'purchase-invoice', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 1 },
        { id: 'stock-ledger', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 2 }
    ],
    task: [
        { id: 'manage-tasks', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 0 },
        { id: 'follow-up', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 1 },
        { id: 'messenger', boxColor: 'default', textColor: 'default', iconColor: 'theme', orderNo: 2 }
    ]
};

export const getPreferences = asyncHandler(async (req, res) => {
    let preference = await UserHomePreference.findOne({ userId: req.user._id });
    
    if (!preference) {
        // Return defaults based on role
        const role = req.user.roleName?.toLowerCase() || 'task';
        const defaultCards = ROLE_DEFAULTS[role] || ROLE_DEFAULTS['task'];
        
        return res.json({
            success: true,
            data: {
                userId: req.user._id,
                selectedCards: defaultCards,
                isDefault: true
            }
        });
    }

    res.json({
        success: true,
        data: preference
    });
});

export const updatePreferences = asyncHandler(async (req, res) => {
    const { selectedCards } = req.body;

    let preference = await UserHomePreference.findOne({ userId: req.user._id });

    if (!preference) {
        preference = await UserHomePreference.create({
            userId: req.user._id,
            selectedCards
        });
    } else {
        preference.selectedCards = selectedCards;
        await preference.save();
    }

    res.json({
        success: true,
        data: preference
    });
});

export const resetPreferences = asyncHandler(async (req, res) => {
    await UserHomePreference.findOneAndDelete({ userId: req.user._id });
    
    const role = req.user.roleName?.toLowerCase() || 'task';
    const defaultCards = ROLE_DEFAULTS[role] || ROLE_DEFAULTS['task'];

    res.json({
        success: true,
        data: {
            userId: req.user._id,
            selectedCards: defaultCards,
            isDefault: true
        }
    });
});
