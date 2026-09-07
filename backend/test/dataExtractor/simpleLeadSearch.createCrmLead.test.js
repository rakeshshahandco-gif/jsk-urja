/**
 * Create Lead duplicate protection — uses existing CRM Lead / Customer collections only.
 * Isolated localhost crm_test. Never inherits Atlas / production MONGODB_URL.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { Lead } from '../../src/models/lead.model.js';
import Customer from '../../src/models/customer.model.js';
import { findCrmDuplicates } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/simpleLeadSearch.createCrmLead.service.js';
import { CRM_STATUS } from '../../src/services/dataExtractor/searchCampaign/simpleLeadSearch/aiVerificationDisplay.util.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `SLS-LEAD-${Date.now()}`;
const companyId = new mongoose.Types.ObjectId();

describe('SLS Create Lead duplicate protection', () => {
    before(async () => {
        assert.match(MONGO_URI, /crm_test/);
        assert.match(MONGO_URI, /127\.0\.0\.1/);
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
        await Lead.deleteMany({ companyId });
        await Customer.deleteMany({ companyId });
    });
    after(async () => {
        await Lead.deleteMany({ companyId });
        await Customer.deleteMany({ companyId });
        await mongoose.disconnect();
    });

    it('returns not_in_crm when no Lead or Customer matches', async () => {
        const dup = await findCrmDuplicates(companyId, {
            companyName: `${TAG} Fresh Co`,
            email: `${TAG}-fresh@example.com`,
            mobile: '9876500001',
            website: 'https://fresh-example-co.test',
            captureId: new mongoose.Types.ObjectId(),
        });
        assert.equal(dup.crmStatus, CRM_STATUS.NOT_IN_CRM);
        assert.equal(dup.existingLead, null);
        assert.equal(dup.existingCustomer, null);
    });

    it('blocks a second Lead when an Existing Lead matches email', async () => {
        const leadId = new mongoose.Types.ObjectId();
        await Lead.collection.insertOne({
            _id: leadId,
            companyId,
            customerName: `${TAG} Existing Lead Co`,
            customerEmail: `${TAG}-lead@example.com`,
            customerMobile: '9876500002',
            source: 'data_extractor',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const dup = await findCrmDuplicates(companyId, {
            companyName: `${TAG} Existing Lead Co`,
            email: `${TAG}-lead@example.com`,
            mobile: '9876500002',
            website: '',
            captureId: new mongoose.Types.ObjectId(),
        });
        assert.equal(dup.crmStatus, CRM_STATUS.EXISTING_LEAD);
        assert.equal(String(dup.existingLead._id), String(leadId));
    });

    it('blocks a Lead when an Existing Customer matches company name', async () => {
        const customerId = new mongoose.Types.ObjectId();
        await Customer.collection.insertOne({
            _id: customerId,
            companyId,
            customerName: `${TAG} Existing Customer Co`,
            isDeleted: false,
            contactPersons: [{ name: 'Test', mobile: '9876500003' }],
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const dup = await findCrmDuplicates(companyId, {
            companyName: `${TAG} Existing Customer Co`,
            email: '',
            mobile: '',
            website: '',
            captureId: new mongoose.Types.ObjectId(),
        });
        assert.equal(dup.crmStatus, CRM_STATUS.EXISTING_CUSTOMER);
        assert.equal(String(dup.existingCustomer._id), String(customerId));
    });
});
