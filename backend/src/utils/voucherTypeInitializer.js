import { VoucherType } from '../models/voucherType.model.js';
import logger from './logger.js';

/**
 * Initializes standard voucher series if they don't exist.
 * Standard series: EXP (Expense), PUR (Purchase), SAL (Sales), RCPT (Receipt), PMT (Payment), CONT (Contra), JRNL (Journal)
 */
export const initializeVoucherTypes = async (userId, financialYear = '2026-2027') => {
    try {
        logger.info('Initializing standard voucher types...');

        const standardTypes = [
            { name: 'EXP', nature: 'Expense', prefix: 'EXP/', startingNumber: 1, remarks: 'Automated Expense Series' },
            { name: 'PUR', nature: 'Purchase', prefix: 'PUR/', startingNumber: 1, remarks: 'Automated Purchase Series' },
            { name: 'SAL', nature: 'Sales', prefix: 'SAL/', startingNumber: 1, remarks: 'Automated Sales Series' },
            { name: 'RCPT', nature: 'Receipt', prefix: 'RCPT/', startingNumber: 1, remarks: 'Automated Receipt Series' },
            { name: 'PMT', nature: 'Payment', prefix: 'PMT/', startingNumber: 1, remarks: 'Automated Payment Series' },
            { name: 'CONT', nature: 'Contra', prefix: 'CONT/', startingNumber: 1, remarks: 'Automated Contra Series' },
            { name: 'JRNL', nature: 'Journal', prefix: 'JRNL/', startingNumber: 1, remarks: 'Automated Journal Series' }
        ];

        for (const type of standardTypes) {
            const exists = await VoucherType.findOne({ name: type.name, financialYear });
            if (!exists) {
                await VoucherType.create({
                    ...type,
                    financialYear,
                    createdBy: userId,
                    active: true,
                    autoNumbering: true,
                    nextNumber: type.startingNumber
                });
                logger.info(`Voucher Type Created: ${type.name} (${type.nature})`);
            }
        }

        logger.info('Voucher types initialization completed.');
        return { success: true };
    } catch (error) {
        logger.error('Error initializing voucher types:', error);
        throw error;
    }
};
