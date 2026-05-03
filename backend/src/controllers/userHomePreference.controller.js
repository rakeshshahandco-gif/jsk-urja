import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import UserHomePreference from '../models/userHomePreference.model.js';

const MODULE_DEFAULTS = {
    'dashboard': [
        { id: 'customer-master', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'sales-order', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'sales-invoice', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'purchase-order', boxColor: 'default', textColor: 'default', orderNo: 3 },
        { id: 'purchase-invoice', boxColor: 'default', textColor: 'default', orderNo: 4 },
        { id: 'stock-ledger', boxColor: 'default', textColor: 'default', orderNo: 5 }
    ],
    'account-master': [
        { id: 'group-master', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'ledger-master', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'financial-year-master', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'series-master', boxColor: 'default', textColor: 'default', orderNo: 3 }
    ],
    'sales': [
        { id: 'sales-order', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'sales-invoice', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'estimate', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'eway-bill', boxColor: 'default', textColor: 'default', orderNo: 3 },
        { id: 'logistics', boxColor: 'default', textColor: 'default', orderNo: 4 }
    ],
    'purchase': [
        { id: 'purchase-order', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'purchase-invoice', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'supplier-master', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'purchase-register', boxColor: 'default', textColor: 'default', orderNo: 3 }
    ],
    'inventory': [
        { id: 'item-master', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'item-group-master', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'item-type-master', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'bom', boxColor: 'default', textColor: 'default', orderNo: 3 },
        { id: 'raw-material-report', boxColor: 'default', textColor: 'default', orderNo: 4 },
        { id: 'finished-goods-report', boxColor: 'default', textColor: 'default', orderNo: 5 },
        { id: 'stock-ledger', boxColor: 'default', textColor: 'default', orderNo: 6 }
    ],
    'production': [
        { id: 'work-order', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'production-entry', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'bom', boxColor: 'default', textColor: 'default', orderNo: 2 }
    ],
    'voucher-entry': [
        { id: 'receipt-voucher', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'payment-voucher', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'journal-voucher', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'expense-voucher', boxColor: 'default', textColor: 'default', orderNo: 3 },
        { id: 'debit-note', boxColor: 'default', textColor: 'default', orderNo: 4 },
        { id: 'credit-note', boxColor: 'default', textColor: 'default', orderNo: 5 }
    ],
    'accounts': [
        { id: 'voucher-register', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'ledger-report', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'sales-register', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'purchase-register', boxColor: 'default', textColor: 'default', orderNo: 3 },
        { id: 'expense-register', boxColor: 'default', textColor: 'default', orderNo: 4 },
        { id: 'day-book', boxColor: 'default', textColor: 'default', orderNo: 5 },
        { id: 'cash-book', boxColor: 'default', textColor: 'default', orderNo: 6 },
        { id: 'bank-book', boxColor: 'default', textColor: 'default', orderNo: 7 },
        { id: 'outstanding-report', boxColor: 'default', textColor: 'default', orderNo: 8 }
    ],
    'crm': [
        { id: 'customer-master', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'lead-inquiry', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'follow-up', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'reminders', boxColor: 'default', textColor: 'default', orderNo: 3 }
    ],
    'gst': [
        { id: 'gstr1', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'gstr3b', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'gst-recon', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'gst-payable', boxColor: 'default', textColor: 'default', orderNo: 3 }
    ],
    'mis': [
        { id: 'sales-mis', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'product-gp', boxColor: 'default', textColor: 'default', orderNo: 1 },
        { id: 'sales-conversion-analysis', boxColor: 'default', textColor: 'default', orderNo: 2 },
        { id: 'customer-gp', boxColor: 'default', textColor: 'default', orderNo: 3 }
    ],
    'service': [
        { id: 'complaints', boxColor: 'default', textColor: 'default', orderNo: 0 },
        { id: 'replacement-dashboard', boxColor: 'default', textColor: 'default', orderNo: 1 }
    ]
};

export const getPreferences = asyncHandler(async (req, res) => {
    const moduleName = req.query.moduleName || 'dashboard';
    let preference = await UserHomePreference.findOne({ userId: req.user._id, moduleName });
    
    if (!preference) {
        // Return defaults for this module
        const defaultCards = MODULE_DEFAULTS[moduleName] || MODULE_DEFAULTS['dashboard'];
        
        return res.json({
            success: true,
            data: {
                userId: req.user._id,
                moduleName,
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
    const { selectedCards, moduleName = 'dashboard' } = req.body;

    let preference = await UserHomePreference.findOne({ userId: req.user._id, moduleName });

    if (!preference) {
        preference = await UserHomePreference.create({
            userId: req.user._id,
            moduleName,
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
    const moduleName = req.query.moduleName || 'dashboard';
    await UserHomePreference.findOneAndDelete({ userId: req.user._id, moduleName });
    
    const defaultCards = MODULE_DEFAULTS[moduleName] || MODULE_DEFAULTS['dashboard'];

    res.json({
        success: true,
        data: {
            userId: req.user._id,
            moduleName,
            selectedCards: defaultCards,
            isDefault: true
        }
    });
});
