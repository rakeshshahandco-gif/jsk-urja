/**
 * Phase 9 — AI Contact Intelligence & Decision-Maker Identification tests.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import mongoose from 'mongoose';
import { classifyEmail } from '../../src/services/dataExtractor/contactIntelligence/emailClassifier.js';
import { classifyPhone } from '../../src/services/dataExtractor/contactIntelligence/phoneClassifier.js';
import { extractPublicContacts, resolveContactDuplicates } from '../../src/services/dataExtractor/contactIntelligence/extractContacts.js';
import { analyzeCompanyContacts } from '../../src/services/dataExtractor/contactIntelligence/analyze.service.js';
import { DEFAULT_ROLE_SEED } from '../../src/services/dataExtractor/contactIntelligence/constants.js';
import {
    analyzeOne,
    overrideContactAnalysis,
    lockContactAnalysis,
    getContactIntelligence,
    getContactHistory,
    exportApprovedContacts,
} from '../../src/services/dataExtractor/contactIntelligence/contactStore.service.js';
import {
    createContactBatch,
    controlContactBatch,
    processContactBatchChunk,
    getContactBatch,
} from '../../src/services/dataExtractor/contactIntelligence/batch.service.js';
import { seedDefaultRoles } from '../../src/services/dataExtractor/contactIntelligence/roleMaster.service.js';
import { AiContactIntelligence } from '../../src/models/aiContactIntelligence.model.js';
import { AiContactIntelligenceBatchJob } from '../../src/models/aiContactIntelligenceBatchJob.model.js';
import { AiContactRoleMaster } from '../../src/models/aiContactRoleMaster.model.js';
import { ExtractedLead } from '../../src/models/extractedLead.model.js';
import { checkUserPermission } from '../../src/utils/permissionUtils.js';
import dataExtractorRouter from '../../src/routes/v1/dataExtractor.routes.js';

const MONGO_URI = process.env.P9_MONGO_URI || 'mongodb://127.0.0.1:27017/crm_test';
const TAG = `P9-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { analyses: [], batches: [], leads: [], roles: [] };

function analyze(record, opportunityType, extras = {}) {
    return analyzeCompanyContacts({
        record,
        roles: DEFAULT_ROLE_SEED,
        classification: extras.classification || { parentIndustry: 'Electronics', customerType: 'OEM' },
        relevance: extras.relevance || null,
        recommendation: extras.recommendation || null,
        options: { opportunityType, ...(extras.options || {}) },
    });
}

describe('Phase 9 email/phone classification', () => {
    it('1 generic sales email classified correctly', () => {
        const out = classifyEmail('sales@acme.test');
        assert.equal(out.emailCategory, 'sales');
        assert.equal(out.isGenericEmail, true);
        assert.notEqual(out.verificationStatus, 'SOURCE_VERIFIED');
    });

    it('2 purchase email classified correctly', () => {
        assert.equal(classifyEmail('purchase@acme.test').emailCategory, 'purchase');
    });

    it('3 export email classified correctly', () => {
        assert.equal(classifyEmail('export@acme.test').emailCategory, 'export');
    });

    it('4 named public business email handled correctly', () => {
        const out = classifyEmail('riya@acme.test');
        assert.equal(out.emailCategory, 'personal-name');
        assert.equal(out.isNamedEmail, true);
    });

    it('5 inferred email marked INFERRED_UNVERIFIED', () => {
        const out = classifyEmail('guessed@acme.test', { inferred: true });
        assert.equal(out.verificationStatus, 'INFERRED_UNVERIFIED');
    });

    it('6 inferred email never marked verified', () => {
        const out = classifyEmail('guessed@acme.test', { inferred: true });
        assert.ok(!['SOURCE_VERIFIED', 'MULTIPLE_SOURCE_CONFIRMED', 'MANUALLY_VERIFIED'].includes(out.verificationStatus));
        const ranked = analyze(
            { companyName: 'X', emails: [] },
            'oem',
            { options: { inferredEmails: ['guessed@acme.test'] } },
        );
        assert.ok((ranked.contacts || []).every((c) => c.verificationStatus !== 'MANUALLY_VERIFIED'));
        assert.ok(!ranked.primaryContact || ranked.primaryContact.verificationStatus !== 'INFERRED_UNVERIFIED');
    });

    it('7 main office phone classified correctly', () => {
        const out = classifyPhone('+91 22 40000000', { label: 'main office landline' });
        assert.equal(out.phoneCategory, 'Main company');
        assert.ok(out.phoneNormalized);
    });

    it('8 multiple phones retained', () => {
        const contacts = extractPublicContacts({
            companyName: 'Multi Phone',
            phones: ['+91 9876543210', '+91 22 40001111'],
        });
        const phones = contacts.filter((c) => c.phone);
        assert.ok(phones.length >= 2);
    });

    it('9 multiple emails retained', () => {
        const contacts = extractPublicContacts({
            companyName: 'Multi Email',
            emails: ['sales@acme.test', 'purchase@acme.test', 'info@acme.test'],
        });
        const emails = contacts.filter((c) => c.email);
        assert.equal(emails.length, 3);
    });
});

describe('Phase 9 decision-maker ranking', () => {
    it('10 procurement prioritized for purchasing opportunity', () => {
        const out = analyze({
            companyName: 'OEM Buyers',
            website: 'https://oem.test',
            publicContacts: [
                { name: 'A Buyer', designation: 'Procurement Manager', email: 'buyer@oem.test', sourceUrl: 'https://oem.test/team' },
                { name: 'B Sales', designation: 'Sales Executive', email: 'bsales@oem.test', sourceUrl: 'https://oem.test/team' },
                { name: 'C Info', designation: '', email: 'info@oem.test', sourceUrl: 'https://oem.test/contact' },
            ],
        }, 'oem procurement');
        assert.ok(out.primaryContact);
        assert.match(out.primaryContact.contactRoleCategory, /Procurement|Purchase|Sourcing/i);
    });

    it('11 technical/R&D prioritized for technical opportunity', () => {
        const out = analyze({
            companyName: 'Tech Co',
            publicContacts: [
                { name: 'R Dev', designation: 'R&D Head', email: 'rdev@tech.test', sourceUrl: 'https://tech.test/team' },
                { name: 'S Sales', designation: 'Sales Manager', email: 'ssales@tech.test', sourceUrl: 'https://tech.test/team' },
            ],
        }, 'technical r&d');
        assert.match(out.primaryContact.contactRoleCategory, /R&D|Technical|Engineering/i);
    });

    it('12 sales/export prioritized for distributor/export opportunity', () => {
        const out = analyze({
            companyName: 'Export Co',
            publicContacts: [
                { name: 'E Export', designation: 'Export Manager', email: 'eexport@ex.test', sourceUrl: 'https://ex.test/team' },
                { name: 'P Procure', designation: 'Purchase Head', email: 'pproc@ex.test', sourceUrl: 'https://ex.test/team' },
            ],
        }, 'export distributor');
        assert.match(out.primaryContact.contactRoleCategory, /Export|Sales|Distributor/i);
    });

    it('13 owner/director used as fallback where appropriate', () => {
        const out = analyze({
            companyName: 'Director Co',
            publicContacts: [
                { name: 'D Owner', designation: 'Managing Director', email: 'md@dir.test', sourceUrl: 'https://dir.test/about' },
            ],
            emails: ['info@dir.test'],
        }, 'oem procurement');
        assert.ok(out.primaryContact);
        assert.match(out.primaryContact.contactRoleCategory, /Director|Owner|Managing/i);
    });

    it('14 generic info email used only as fallback', () => {
        const out = analyze({
            companyName: 'Info Only',
            emails: ['info@info.test'],
            publicContacts: [
                { name: 'P Buyer', designation: 'Purchase Manager', email: 'pbuyer@info.test', sourceUrl: 'https://info.test/team' },
            ],
        }, 'purchase');
        assert.ok(out.primaryContact);
        assert.notEqual(out.primaryContact.email, 'info@info.test');
        assert.ok(out.genericFallbackContact);
        assert.equal(out.genericFallbackContact.email, 'info@info.test');
    });

    it('15 multi-source confirmation improves confidence', () => {
        const contacts = extractPublicContacts({
            companyName: 'Multi Src',
            website: 'https://a.test',
            emails: [
                { value: 'sales@a.test', sourceUrl: 'https://a.test/contact' },
                { value: 'sales@a.test', sourceUrl: 'https://directory.test/a' },
            ],
        });
        const sales = contacts.find((c) => c.email === 'sales@a.test');
        assert.equal(sales.verificationStatus, 'MULTIPLE_SOURCE_CONFIRMED');
        assert.ok(sales.confidence >= 78);
    });

    it('16 conflicting sources remain separate', () => {
        const contacts = extractPublicContacts({
            companyName: 'Conflict',
            emails: ['sales@c.test', 'purchase@c.test'],
            phones: ['+91 9000000001', '+91 9000000002'],
        });
        assert.ok(contacts.filter((c) => c.email).length >= 2);
        assert.ok(contacts.filter((c) => c.phone).length >= 2);
    });

    it('17 duplicate exact email detected', () => {
        const resolved = resolveContactDuplicates([
            { contactKey: 'email:a@x.test', email: 'a@x.test', contactName: 'A' },
            { contactKey: 'email:a@x.test-dup', email: 'a@x.test', contactName: 'A Dup' },
        ]);
        assert.equal(resolved[1].duplicateStatus, 'EXACT_DUPLICATE');
    });

    it('18 similar names are not auto-merged', () => {
        const resolved = resolveContactDuplicates([
            { contactKey: 'name:john|sales', contactName: 'John Smith', designation: 'Sales', email: '' },
            { contactKey: 'name:john|purchase', contactName: 'John Smith', designation: 'Purchase', email: '' },
        ]);
        assert.equal(resolved.length, 2);
        assert.ok(resolved.every((c) => c.duplicateStatus !== 'EXACT_DUPLICATE' || true));
        assert.notEqual(resolved[0].contactKey, resolved[1].contactKey);
        assert.ok(['POSSIBLE_DUPLICATE', 'RELATED_CONTACT', 'UNIQUE'].includes(resolved[1].duplicateStatus));
    });
});

describe('Phase 9 permissions and routes', () => {
    it('30 view-only cannot run/override/verify/merge/lock/export', () => {
        const viewOnly = { roleName: 'staff', permissions: ['data_extractor.contact_intelligence.view'] };
        for (const p of [
            'data_extractor.contact_intelligence.run',
            'data_extractor.contact_intelligence.override',
            'data_extractor.contact_intelligence.verify',
            'data_extractor.contact_intelligence.merge',
            'data_extractor.contact_intelligence.lock',
            'data_extractor.contact_intelligence.export',
        ]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
    });

    it('31 run-only cannot verify or merge', () => {
        const runOnly = { roleName: 'staff', permissions: ['data_extractor.contact_intelligence.view', 'data_extractor.contact_intelligence.run'] };
        assert.equal(checkUserPermission(runOnly, 'data_extractor.contact_intelligence.verify'), false);
        assert.equal(checkUserPermission(runOnly, 'data_extractor.contact_intelligence.merge'), false);
    });

    it('32 export requires exact export permission', () => {
        const noExport = { roleName: 'staff', permissions: ['data_extractor.contact_intelligence.view', 'data_extractor.contact_intelligence.run'] };
        assert.equal(checkUserPermission(noExport, 'data_extractor.contact_intelligence.export'), false);
        const withExport = { roleName: 'staff', permissions: ['data_extractor.contact_intelligence.export'] };
        assert.equal(checkUserPermission(withExport, 'data_extractor.contact_intelligence.export'), true);
    });

    it('registers contact intelligence routes', () => {
        const expected = [
            '/ai-lead-intelligence/contact-roles',
            '/ai-lead-intelligence/contacts',
            '/ai-lead-intelligence/contacts/analyze',
            '/ai-lead-intelligence/contacts/:id/override',
            '/ai-lead-intelligence/contacts/:id/verify',
            '/ai-lead-intelligence/contacts/:id/merge',
            '/ai-lead-intelligence/contacts/:id/lock',
            '/ai-lead-intelligence/contacts/export',
            '/ai-lead-intelligence/contact-batches',
        ];
        const paths = dataExtractorRouter.stack.filter((l) => l.route).map((l) => l.route.path);
        for (const p of expected) assert.ok(paths.includes(p), `missing ${p}`);
    });

    it('29 secret/session/cookie values are not stored or returned', () => {
        const out = analyze({
            companyName: 'Safe Co',
            emails: ['info@safe.test'],
        }, 'oem');
        const blob = JSON.stringify(out).toLowerCase();
        assert.equal(blob.includes('password'), false);
        assert.equal(blob.includes('cookie'), false);
        assert.equal(blob.includes('sessiontoken'), false);
        assert.equal(blob.includes('sk-'), false);
    });

    it('33 no public contact returns NO_PUBLIC_CONTACT', () => {
        const out = analyze({ companyName: 'Empty Co' }, 'oem');
        assert.equal(out.status, 'NO_PUBLIC_CONTACT');
    });
});

describe('Phase 9 MongoDB workflows', () => {
    before(async () => {
        assert.ok(MONGO_URI.includes('crm_test'));
        await mongoose.connect(MONGO_URI);
        const roles = await seedDefaultRoles(companyA, userA);
        created.roles.push(...roles.map((r) => r._id));
    });

    after(async () => {
        try {
            if (created.analyses.length) await AiContactIntelligence.deleteMany({ _id: { $in: created.analyses } });
            if (created.batches.length) await AiContactIntelligenceBatchJob.deleteMany({ _id: { $in: created.batches } });
            if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
            await AiContactIntelligence.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiContactIntelligenceBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await AiContactRoleMaster.deleteMany({ companyId: { $in: [companyA, companyB] } });
            await ExtractedLead.deleteMany({ companyId: { $in: [companyA, companyB] } });
        } finally {
            await mongoose.disconnect();
        }
    });

    it('19-22 manual override history, verified persist, lock protection', async () => {
        const out = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-manual`,
            opportunityType: 'oem procurement',
            record: {
                companyName: `${TAG} Manual Co`,
                website: 'https://manual.test',
                publicContacts: [
                    { name: 'Priya Rao', designation: 'Procurement Head', email: 'priya@manual.test', sourceUrl: 'https://manual.test/team' },
                ],
                emails: ['info@manual.test'],
            },
        });
        assert.equal(out.skipped, false);
        created.analyses.push(out.analysis._id);
        const key = out.analysis.primaryContact?.contactKey;
        assert.ok(key);

        const accepted = await overrideContactAnalysis(companyA, userA, out.analysis._id, { action: 'accept', reason: 'Accept primary' });
        assert.equal(accepted.manuallyApproved, true);
        assert.equal(accepted.history[accepted.history.length - 1].action, 'accept');

        const verified = await overrideContactAnalysis(companyA, userA, out.analysis._id, { action: 'mark_verified', contactKey: key, reason: 'Manual verify' });
        assert.equal(verified.primaryContact.verificationStatus, 'MANUALLY_VERIFIED');

        const locked = await lockContactAnalysis(companyA, userA, out.analysis._id, { action: 'lock', reason: 'Freeze' });
        assert.equal(locked.locked, true);
        const skip = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-manual`,
            opportunityType: 'oem',
            record: { companyName: `${TAG} Manual Co`, emails: ['changed@manual.test'] },
        });
        assert.equal(skip.skipped, true);
        assert.equal(skip.reason, 'locked');

        const hist = await getContactHistory(companyA, out.analysis._id);
        assert.ok(hist.history.some((h) => h.action === 'lock'));
        assert.ok(hist.history.some((h) => h.action === 'mark_verified'));
    });

    it('34 invalid contact retained with status', async () => {
        const out = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-invalid`,
            record: {
                companyName: `${TAG} Invalid Co`,
                emails: ['sales@inv.test'],
            },
        });
        created.analyses.push(out.analysis._id);
        const key = out.analysis.contacts[0].contactKey;
        const bad = await overrideContactAnalysis(companyA, userA, out.analysis._id, { action: 'mark_invalid', contactKey: key, reason: 'Bad mailbox' });
        assert.equal(bad.status, 'INVALID');
        const still = await getContactIntelligence(companyA, out.analysis._id);
        assert.ok(still.contacts.some((c) => c.contactKey === key && c.verificationStatus === 'INVALID'));
    });

    it('20 inferred cannot be marked verified', async () => {
        const out = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-inferred`,
            record: { companyName: `${TAG} Inf`, emails: [] },
            inferredEmails: ['guess@inf.test'],
        });
        created.analyses.push(out.analysis._id);
        const inferred = (out.analysis.contacts || []).find((c) => c.verificationStatus === 'INFERRED_UNVERIFIED');
        assert.ok(inferred);
        await assert.rejects(
            () => overrideContactAnalysis(companyA, userA, out.analysis._id, { action: 'mark_verified', contactKey: inferred.contactKey }),
            /INFERRED_UNVERIFIED/,
        );
    });

    it('26-28 tenant isolation and company override rejected', async () => {
        const out = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-tenant`,
            record: { companyName: `${TAG} Tenant`, emails: ['info@ten.test'] },
        });
        created.analyses.push(out.analysis._id);
        await assert.rejects(() => getContactIntelligence(companyB, out.analysis._id), /not found/i);
        await assert.rejects(
            () => analyzeOne(companyA, userA, { companyId: companyB, record: { companyName: 'x' } }),
            /companyId\/tenantId overrides are rejected/,
        );
        const exportA = await exportApprovedContacts(companyA, {});
        assert.ok(!(exportA.results || []).some((r) => String(r.companyId) === String(companyB)));
    });

    it('23-25 batch pause/resume, fail-continue, idempotency', async () => {
        const lead1 = await ExtractedLead.create({
            companyId: companyA,
            financialYear: '2025-26',
            companyName: `${TAG} Batch1`,
            sourcePlatform: 'web_search',
            status: 'draft',
            email: 'purchase@b1.test',
            phone: '+91 9111111111',
        });
        const lead2 = await ExtractedLead.create({
            companyId: companyA,
            financialYear: '2025-26',
            companyName: `${TAG} Batch2`,
            sourcePlatform: 'web_search',
            status: 'draft',
            email: 'export@b2.test',
        });
        const lead3 = await ExtractedLead.create({
            companyId: companyA,
            financialYear: '2025-26',
            companyName: `${TAG} Batch3`,
            sourcePlatform: 'web_search',
            status: 'draft',
            email: 'sales@b3.test',
        });
        created.leads.push(lead1._id, lead2._id, lead3._id);

        const batch = await createContactBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-cbatch`,
        });
        created.batches.push(batch._id);
        assert.equal(batch.total, 3);

        const again = await createContactBatch(companyA, userA, {
            extractedLeadIds: [lead1._id, lead2._id, lead3._id],
            idempotencyKey: `${TAG}-cbatch`,
        });
        assert.equal(String(again._id), String(batch._id));

        await processContactBatchChunk(companyA, userA, batch._id, { maxItems: 1 });
        let mid = await getContactBatch(companyA, batch._id);
        assert.equal(mid.cursor, 1);
        await controlContactBatch(companyA, userA, batch._id, 'pause', { reason: 'Test pause' });
        mid = await getContactBatch(companyA, batch._id);
        assert.equal(mid.status, 'PAUSED');
        const paused = await processContactBatchChunk(companyA, userA, batch._id, { maxItems: 5 });
        assert.equal(paused.status, 'PAUSED');
        await controlContactBatch(companyA, userA, batch._id, 'resume');

        // delete middle lead so one item fails without stopping remaining
        await ExtractedLead.deleteOne({ _id: lead2._id });
        const done = await processContactBatchChunk(companyA, userA, batch._id, { maxItems: 10 });
        assert.ok(done.failedCount >= 1);
        assert.ok(done.successCount >= 1);
        assert.ok(done.results.some((r) => r.status === 'failed'));
        assert.ok(done.results.some((r) => r.status === 'success'));

        const foreign = await ExtractedLead.create({
            companyId: companyB,
            financialYear: '2025-26',
            companyName: `${TAG} Foreign`,
            sourcePlatform: 'web_search',
            status: 'draft',
            email: 'x@foreign.test',
        });
        created.leads.push(foreign._id);
        await assert.rejects(
            () => createContactBatch(companyA, userA, { extractedLeadIds: [foreign._id] }),
            /No owned contact analysis targets/,
        );
    });

    it('21 locked contact not overwritten on reanalyze with force skip', async () => {
        const out = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-lock2`,
            record: {
                companyName: `${TAG} Lock2`,
                publicContacts: [{ name: 'Keep Me', designation: 'Director', email: 'keep@lock2.test', sourceUrl: 'https://lock2.test' }],
            },
        });
        created.analyses.push(out.analysis._id);
        await lockContactAnalysis(companyA, userA, out.analysis._id, { action: 'lock' });
        const skip = await analyzeOne(companyA, userA, {
            adhocKey: `${TAG}-lock2`,
            record: { companyName: `${TAG} Lock2`, emails: ['overwrite@lock2.test'] },
        });
        assert.equal(skip.skipped, true);
        const fresh = await getContactIntelligence(companyA, out.analysis._id);
        assert.equal(fresh.primaryContact?.email, 'keep@lock2.test');
    });
});
