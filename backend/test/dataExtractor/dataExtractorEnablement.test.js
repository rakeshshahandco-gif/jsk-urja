import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { Company } from '../../src/models/company.model.js';
import { ExtractorSettings } from '../../src/models/extractorSettings.model.js';
import { Lead } from '../../src/models/lead.model.js';
import {
    assertDataExtractorEnabledForCompany,
    getDataExtractorEnablement,
    isDataExtractorEnabledForCompany,
    isDataExtractorModuleKey,
    syncExtractorSettingsWithAllocation,
} from '../../src/services/dataExtractor/dataExtractorEnablement.service.js';
import { getOrCreateExtractorSettings } from '../../src/services/dataExtractor/extractor.service.js';
import { clearModuleGuardCache } from '../../src/services/moduleGuard.service.js';
import { isPlatformAdminUser } from '../../src/constants/platformAccess.constants.js';

const uri = process.env.MONGODB_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';

describe('Data Extractor company enablement (allocation master)', () => {
    let companyAllocated;
    let companyDisabled;
    let leadCountBefore;

    before(async () => {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        clearModuleGuardCache();
        leadCountBefore = await Lead.countDocuments({});

        companyAllocated = await Company.create({
            companyName: `DE Enable Allocated ${Date.now()}`,
            enabledModules: ['crm', 'data_extractor', 'whatsapp', 'whatsapp_ai'],
            moduleGuardEnabled: true,
            moduleAllocationConfigured: true,
            isActive: true,
        });
        companyDisabled = await Company.create({
            companyName: `DE Enable Disabled ${Date.now()}`,
            enabledModules: ['crm', 'sales'],
            moduleGuardEnabled: true,
            moduleAllocationConfigured: true,
            isActive: true,
        });
    });

    after(async () => {
        const ids = [companyAllocated?._id, companyDisabled?._id].filter(Boolean);
        if (ids.length) {
            await ExtractorSettings.deleteMany({ companyId: { $in: ids } });
            await Company.deleteMany({ _id: { $in: ids } });
        }
        const leadCountAfter = await Lead.countDocuments({});
        assert.equal(leadCountAfter, leadCountBefore, 'CRM Lead count must remain unchanged');
        await mongoose.disconnect();
    });

    it('normalizes module-key formats', () => {
        assert.ok(isDataExtractorModuleKey('data_extractor'));
        assert.ok(isDataExtractorModuleKey('data-extractor'));
        assert.ok(isDataExtractorModuleKey('market_finder'));
        assert.equal(isDataExtractorModuleKey('whatsapp'), false);
    });

    it('module allocated + settings missing → opens with safe defaults', async () => {
        clearModuleGuardCache(companyAllocated._id);
        await ExtractorSettings.deleteMany({ companyId: companyAllocated._id });
        const settings = await getOrCreateExtractorSettings(companyAllocated._id);
        assert.equal(settings.moduleEnabled, true);
        assert.equal(await isDataExtractorEnabledForCompany(companyAllocated._id), true);
        const again = await getOrCreateExtractorSettings(companyAllocated._id);
        assert.equal(again.moduleEnabled, true);
    });

    it('module allocated + settings enabled → opens', async () => {
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyAllocated._id },
            { $set: { moduleEnabled: true } },
            { upsert: true },
        );
        clearModuleGuardCache(companyAllocated._id);
        assert.equal(await isDataExtractorEnabledForCompany(companyAllocated._id), true);
        await assertDataExtractorEnabledForCompany(companyAllocated._id);
    });

    it('module allocated + settings default-OFF → repaired to ON', async () => {
        await ExtractorSettings.findOneAndUpdate(
            { companyId: companyAllocated._id },
            { $set: { moduleEnabled: false, maxUrlsPerJob: 33 } },
            { upsert: true },
        );
        clearModuleGuardCache(companyAllocated._id);
        const synced = await syncExtractorSettingsWithAllocation(companyAllocated._id);
        assert.equal(synced.moduleEnabled, true);
        assert.equal(synced.maxUrlsPerJob, 33, 'must not reset other settings');
    });

    it('module explicitly disabled → blocked', async () => {
        clearModuleGuardCache(companyDisabled._id);
        await ExtractorSettings.deleteMany({ companyId: companyDisabled._id });
        assert.equal(await isDataExtractorEnabledForCompany(companyDisabled._id), false);
        const settings = await getOrCreateExtractorSettings(companyDisabled._id);
        assert.equal(settings.moduleEnabled, false);
        await assert.rejects(
            () => assertDataExtractorEnabledForCompany(companyDisabled._id),
            (err) => err?.statusCode === 403 || err?.status === 403,
        );
    });

    it('alias market_finder in enabledModules counts as allocated', async () => {
        const co = await Company.create({
            companyName: `DE Alias ${Date.now()}`,
            enabledModules: ['crm', 'market_finder'],
            moduleGuardEnabled: true,
            moduleAllocationConfigured: true,
            isActive: true,
        });
        try {
            clearModuleGuardCache(co._id);
            const en = await getDataExtractorEnablement(co._id);
            assert.equal(en.enabled, true);
            assert.equal(en.source, 'enabledModules');
        } finally {
            await ExtractorSettings.deleteMany({ companyId: co._id });
            await Company.deleteMany({ _id: co._id });
        }
    });

    it('Platform Admin helper remains distinct from Client Admin', () => {
        assert.equal(isPlatformAdminUser({ roleName: 'superadmin' }), true);
        assert.equal(isPlatformAdminUser({ roleName: 'admin' }), false);
        assert.equal(isPlatformAdminUser({ roleName: 'clientadmin' }), false);
    });

    it('company isolation: disabled company does not inherit allocated company state', async () => {
        clearModuleGuardCache();
        assert.equal(await isDataExtractorEnabledForCompany(companyAllocated._id), true);
        assert.equal(await isDataExtractorEnabledForCompany(companyDisabled._id), false);
    });
});
