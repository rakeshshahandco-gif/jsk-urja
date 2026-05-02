import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import logger from './logger.js';
import mongoose from 'mongoose';

/**
 * Normalizes a name for fuzzy matching (removes special chars, extra spaces, etc.)
 */
export const normalizeName = (name) => {
    if (!name) return '';
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ' ') // Replace non-alphanumeric with space
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
};

/**
 * Resolves Account Group ID by name
 */
export const getGroupIdByName = async (groupName) => {
    const group = await AccountGroup.findOne({ name: groupName }).select('_id').lean();
    return group?._id || null;
};

/**
 * Finds a matching ledger for a customer or supplier.
 * Matching priority:
 * A. GSTIN match
 * B. PAN match
 * C. Exact entity name match
 * D. Name + City match
 * E. Mobile/email match if available
 */
export const findMatchingLedger = async ({ name, city, gstin, pan, mobile, email, type }) => {
    if (!name) return null;

    // 1. GSTIN Match
    if (gstin && gstin.trim()) {
        const match = await AccountLedger.findOne({ gstin: gstin.trim(), type }).lean();
        if (match) return match;
    }

    // 2. PAN Match
    if (pan && pan.trim()) {
        const match = await AccountLedger.findOne({ pan: pan.trim(), type }).lean();
        if (match) return match;
    }

    // 3. Exact Name Match (Case-insensitive)
    const exactNameRegex = new RegExp(`^\\s*${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const nameMatch = await AccountLedger.findOne({ name: exactNameRegex, type }).lean();
    if (nameMatch) return nameMatch;

    // 4. Name + City Match
    if (city && city.trim()) {
        const nameCity = `${name.trim()} - ${city.trim()}`;
        const nameCityRegex = new RegExp(`^\\s*${nameCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const cityMatch = await AccountLedger.findOne({ name: nameCityRegex, type }).lean();
        if (cityMatch) return cityMatch;
    }

    // 5. Mobile/Email Match
    if (mobile || email) {
        const query = { type, $or: [] };
        if (mobile && mobile.trim()) query.$or.push({ mobile: mobile.trim() });
        if (email && email.trim()) query.$or.push({ email: email.trim().toLowerCase() });
        
        if (query.$or.length > 0) {
            const contactMatch = await AccountLedger.findOne(query).lean();
            if (contactMatch) return contactMatch;
        }
    }

    // 6. Fuzzy Match (Possible Duplicate)
    const normalizedTarget = normalizeName(name);
    const allLedgersOfType = await AccountLedger.find({ type }).select('name').lean();
    for (const ledger of allLedgersOfType) {
        if (normalizeName(ledger.name) === normalizedTarget) {
            return ledger; // Found a fuzzy match
        }
    }

    return null;
};

/**
 * Creates and/or links a ledger for a Customer or Supplier
 */
export const autoLinkEntityLedger = async (entity, entityType, session = null) => {
    try {
        const isCustomer = entityType === 'Customer';
        const name = isCustomer ? (entity.company || entity.customerName) : entity.supplierName;
        const city = entity.city || '';
        const gstin = entity.gstNumber || '';
        const pan = isCustomer ? '' : (entity.panNumber || ''); // Customers usually don't have separate PAN field in this model
        
        // Extract mobile/email safely
        let mobile = '';
        let email = '';
        if (isCustomer) {
            const primaryContact = entity.contactPersons?.find(c => c.isPrimary) || entity.contactPersons?.[0];
            mobile = primaryContact?.mobile || '';
            email = entity.companyEmail || primaryContact?.email || '';
        } else {
            mobile = entity.phone || '';
            email = entity.email || '';
        }

        // 1. Check if already linked correctly
        if (entity.ledgerId) {
            const existing = await AccountLedger.findById(entity.ledgerId).lean();
            if (existing && existing.referenceId?.toString() === entity._id.toString()) {
                return entity.ledgerId;
            }
        }

        // 2. Try to find an existing matching ledger
        const matchedLedger = await findMatchingLedger({
            name, city, gstin, pan, mobile, email,
            type: entityType
        });

        if (matchedLedger) {
            // Link existing ledger to entity
            await entity.constructor.updateOne(
                { _id: entity._id },
                { $set: { ledgerId: matchedLedger._id } },
                { session }
            );
            
            // Link entity to ledger if not already linked
            if (!matchedLedger.referenceId) {
                await AccountLedger.updateOne(
                    { _id: matchedLedger._id },
                    { 
                        $set: { 
                            referenceId: entity._id, 
                            referenceModel: entityType,
                            isCustomer: isCustomer,
                            isSupplier: !isCustomer
                        } 
                    },
                    { session }
                );
            }
            
            return matchedLedger._id;
        }

        // 3. Create new ledger if no match found
        const groupName = isCustomer ? 'Sundry Debtors' : 'Sundry Creditors';
        const groupId = await getGroupIdByName(groupName);
        
        const ledgerName = city ? `${name.trim()} - ${city.trim()}` : name.trim();
        
        // Ensure ledgerName is unique (append random or serial if needed, but uniqueness is enforced in model)
        let finalLedgerName = ledgerName;
        let counter = 1;
        while (await AccountLedger.exists({ name: new RegExp(`^${finalLedgerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) {
            finalLedgerName = `${ledgerName} (${counter})`;
            counter++;
        }

        const newLedger = await AccountLedger.create([{
            name: finalLedgerName,
            underGroup: groupId,
            groupName: groupName,
            type: entityType,
            isCustomer: isCustomer,
            isSupplier: !isCustomer,
            referenceId: entity._id,
            referenceModel: entityType,
            openingBalance: entity.openingBalance || 0,
            drCr: isCustomer ? (entity.drCr || 'Dr') : (entity.openingBalanceDrCr || 'Cr'),
            currentBalance: isCustomer 
                ? (entity.drCr === 'Cr' ? -(entity.openingBalance || 0) : (entity.openingBalance || 0))
                : (entity.openingBalanceDrCr === 'Cr' ? -(entity.openingBalance || 0) : (entity.openingBalance || 0)),
            gstin,
            pan,
            mobile,
            email,
            city,
            address: entity.address || '',
            state: entity.state || '',
            pincode: entity.pincode || '',
            createdBy: entity.createdBy || null
        }], { session });

        const ledgerId = newLedger[0]._id;

        // Update entity with new ledgerId
        await entity.constructor.updateOne(
            { _id: entity._id },
            { $set: { ledgerId: ledgerId } },
            { session }
        );

        return ledgerId;
    } catch (error) {
        logger.error(`Error in autoLinkEntityLedger for ${entityType}:`, error);
        return null;
    }
};
