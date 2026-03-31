import Customer from '../models/customer.model.js';
import { AccountLedger } from '../models/accountLedger.model.js';
import { AccountGroup } from '../models/accountGroup.model.js';
import { getSundryDebtorsGroupId } from '../utils/accountInitializer.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';

/**
 * Generate a new unique customer code (e.g., CU001)
 * @returns {Promise<string>}
 */
const genCustomerCode = async (offset = 0) => {
    // Look for codes that follow the CU000 pattern
    const last = await Customer.findOne({ customerCode: { $regex: /^CU\d+$/ } }).sort({ customerCode: -1 });
    let nextNum = 1;
    if (last && last.customerCode) {
        const numericPart = last.customerCode.replace('CU', '');
        nextNum = parseInt(numericPart, 10) + 1;
    }
    return `CU${String(nextNum + offset).padStart(3, '0')}`;
};

/**
 * Create a customer
 * @param {Object} body
 * @returns {Promise<Customer>}
 */
const createCustomer = async (body) => {
    logger.info('📝 Creating customer:', { customerName: body.customerName, company: body.company });

    // ── Duplicate check by company name ─────────────────────────────────────
    if (body.company && body.company.trim().length > 2) {
        const normCo = body.company.trim();
        const coRegex = new RegExp(`^\\s*${normCo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        const existByCompany = await Customer.findOne({
            company: coRegex,
            isDeleted: { $ne: true }
        }).select('_id customerCode company').lean();
        if (existByCompany) {
            throw new ApiError(
                409,
                `A customer with company name "${normCo}" already exists [${existByCompany.customerCode}]. Please edit the existing record instead of creating a duplicate.`
            );
        }
    }

    // ── Duplicate check by primary mobile ───────────────────────────────────
    const primaryMobile = body.contactPersons?.[0]?.mobile?.trim();
    if (primaryMobile && primaryMobile.length >= 10) {
        const existByMobile = await Customer.findOne({
            'contactPersons.mobile': primaryMobile,
            isDeleted: { $ne: true }
        }).select('_id customerCode company customerName').lean();
        if (existByMobile) {
            throw new ApiError(
                409,
                `A customer with mobile "${primaryMobile}" already exists [${existByMobile.customerCode}] ${existByMobile.company || existByMobile.customerName}. Please edit the existing record instead.`
            );
        }
    }

    if (!body.customerCode) {
        body.customerCode = await genCustomerCode();
    }

    const customer = await Customer.create(body);

    // Create Ledger in Chart of Accounts under Sundry Debtors
    try {
        const groupId = await getSundryDebtorsGroupId();
        await AccountLedger.create({
            name: customer.company || customer.customerName,
            underGroup: groupId,
            groupName: 'Sundry Debtors',
            type: 'Customer',
            isCustomer: true,
            referenceId: customer._id,
            referenceModel: 'Customer',
            openingBalance: customer.openingBalance || 0,
            currentBalance: customer.openingBalance || 0
        });
    } catch (ledgerErr) {
        logger.error('❌ Failed to create ledger for customer:', ledgerErr);
    }

    logger.info(`✅ Customer created successfully with ID: ${customer._id}, Code: ${customer.customerCode}`);
    return customer;
};

/**
 * Query for customers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<Object>}
 */
const queryCustomers = async (filter, options) => {
    const finalFilter = { ...filter, isDeleted: false };

    // Search logic
    if (options.search) {
        const searchRegex = { $regex: options.search, $options: 'i' };
        finalFilter.$or = [
            { customerName: searchRegex },
            { company: searchRegex },
            { companyBrand: searchRegex },
            { 'contactPersons.name': searchRegex },
            { 'contactPersons.mobile': searchRegex },
            { 'contactPersons.mobile2': searchRegex },
            { 'contactPersons.mobile3': searchRegex },
            { 'contactPersons.mobile4': searchRegex },
            { 'contactPersons.mobile5': searchRegex },
        ];
    }

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const skip = (page - 1) * limit;

    // Sorting
    let sort = '';
    if (options.sortBy) {
        const sortingCriteria = [];
        options.sortBy.split(',').forEach((sortOption) => {
            const [key, order] = sortOption.split(':');
            sortingCriteria.push((order === 'desc' ? '-' : '') + key);
        });
        sort = sortingCriteria.join(' ');
    } else {
        sort = 'createdAt';
    }

    const customers = await Customer.find(finalFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('stickers');

    const totalResults = await Customer.countDocuments(finalFilter);
    const totalPages = Math.ceil(totalResults / limit);

    return {
        results: customers,
        page,
        limit,
        totalPages,
        totalResults
    };
};

/**
 * Get customer by id
 * @param {ObjectId} id
 * @returns {Promise<Customer>}
 */
const getCustomerById = async (id) => {
    return Customer.findOne({ _id: id, isDeleted: false }).populate('stickers');
};

/**
 * Update customer by id
 * @param {ObjectId} customerId
 * @param {Object} updateBody
 * @returns {Promise<Customer>}
 */
const updateCustomerById = async (customerId, updateBody) => {
    // ⚠️  SAFETY: Never allow an update to soft-delete a customer.
    //    Strip isDeleted from any payload so that no code path can
    //    accidentally hide a customer by setting isDeleted = true.
    const safeBody = { ...updateBody };
    delete safeBody.isDeleted;  // cannot be changed via normal update
    delete safeBody.restoredAt;
    delete safeBody.restoredReason;

    const customer = await Customer.findOneAndUpdate(
        { _id: customerId, isDeleted: { $ne: true } },  // only update if NOT already deleted
        { $set: safeBody },
        { new: true, runValidators: true }
    );

    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    return customer;
};

/**
 * Delete customer by id
 * 🛡️  PROTECTED: Customers with active Sales Orders or Sales Invoices CANNOT be deleted.
 * @param {ObjectId} customerId
 * @returns {Promise}
 */
const deleteCustomerById = async (customerId) => {
    // ── Guard 1: Customer must exist ──────────────────────────────────────────
    const customer = await Customer.findOne({ _id: customerId, isDeleted: { $ne: true } })
        .select('_id customerCode company customerName')
        .lean();
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    // ── Guard 2: Block if active Sales Orders exist ───────────────────────────
    const activeSO = await SalesOrder.countDocuments({
        customerId,
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled', 'Closed'] }
    });
    if (activeSO > 0) {
        throw new ApiError(
            400,
            `Cannot delete customer "${customer.company || customer.customerName}" — they have ${activeSO} active Sales Order(s). Cancel or close those orders first.`
        );
    }

    // ── Guard 3: Block if Sales Invoices exist (any status) ───────────────────
    const anyInvoice = await SalesInvoice.countDocuments({
        customerId,
        isDeleted: { $ne: true }
    });
    if (anyInvoice > 0) {
        throw new ApiError(
            400,
            `Cannot delete customer "${customer.company || customer.customerName}" — they have ${anyInvoice} Sales Invoice(s) on record. Customer records with invoices are kept permanently for compliance.`
        );
    }

    // ── Safe to soft-delete ───────────────────────────────────────────────────
    // Use atomic updateOne — avoids triggering Mongoose validators on save()
    const result = await Customer.updateOne(
        { _id: customerId, isDeleted: { $ne: true } },
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
            }
        }
    );
    if (result.matchedCount === 0) {
        throw new ApiError(404, 'Customer not found');
    }
    logger.info(`🗑️  Customer soft-deleted: [${customer.customerCode}] ${customer.company || customer.customerName}`);
    return result;
};

/**
 * Find customers by mobile numbers
 * @param {Array} mobiles - Array of mobile numbers
 * @returns {Promise<Array>}
 */
const findByMobiles = async (mobiles) => {
    return Customer.find({
        'contactPersons.mobile': { $in: mobiles },
        isDeleted: false
    });
};

/**
 * Bulk create customers
 * @param {Array} customers - Array of customer objects
 * @returns {Promise<Array>}
 */
const bulkCreateCustomers = async (customers) => {
    // Assign codes if missing
    for (let i = 0; i < customers.length; i++) {
        if (!customers[i].customerCode) {
            customers[i].customerCode = await genCustomerCode(i);
        }
    }
    return Customer.insertMany(customers, { ordered: false });
};

/**
 * Get all unique customer types
 * @returns {Promise<Array<string>>}
 */
/**
 * Get all unique customer stickers
 * @returns {Promise<Array<string>>}
 */
const getCustomerTypes = async () => {
    return Customer.distinct('customerType', { isDeleted: false, customerType: { $ne: '' } });
};

const getCustomerStickers = async () => {
    return Customer.distinct('sticker', { isDeleted: false, sticker: { $ne: '' } });
};

export default {
    createCustomer,
    queryCustomers,
    getCustomerById,
    updateCustomerById,
    deleteCustomerById,
    findByMobiles,
    bulkCreateCustomers,
    getCustomerTypes,
    getCustomerStickers,
};
