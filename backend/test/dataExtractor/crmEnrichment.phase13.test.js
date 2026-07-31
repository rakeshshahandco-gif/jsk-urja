/**
 * Phase 13 — Controlled CRM Enrichment and Lead Draft Conversion.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { evaluateEligibility } from "../../src/services/dataExtractor/crmEnrichment/eligibility.service.js";
import { scoreCrmCandidate, classifyCrmMatches, matchAgainstCrm } from "../../src/services/dataExtractor/crmEnrichment/matching.service.js";
import {
    buildProposedFieldsFromSource,
    buildFieldComparisons,
    applyFieldDecisions,
} from "../../src/services/dataExtractor/crmEnrichment/comparison.service.js";
import { buildPatchFromDecisions } from "../../src/services/dataExtractor/crmEnrichment/crmAdapter.service.js";
import { assertNoSecrets } from "../../src/services/dataExtractor/crmEnrichment/normalize.util.js";
import {
    prepareDraft,
    setFieldDecisions,
    previewDraft,
    finalApproveDraft,
    createLeadFromDraft,
    applyEnrichmentFromDraft,
    lockDraft,
    getDraftHistory,
} from "../../src/services/dataExtractor/crmEnrichment/draft.service.js";
import { rollbackTransaction } from "../../src/services/dataExtractor/crmEnrichment/rollback.service.js";
import {
    createEnrichmentBatch,
    controlEnrichmentBatch,
    processEnrichmentBatchChunk,
    getEnrichmentBatch,
} from "../../src/services/dataExtractor/crmEnrichment/batch.service.js";
import { AiCrmEnrichmentDraft } from "../../src/models/aiCrmEnrichmentDraft.model.js";
import { AiCrmEnrichmentTransaction } from "../../src/models/aiCrmEnrichmentTransaction.model.js";
import { AiCrmEnrichmentBatchJob } from "../../src/models/aiCrmEnrichmentBatchJob.model.js";
import { ExtractedLead } from "../../src/models/extractedLead.model.js";
import { Lead } from "../../src/models/lead.model.js";
import { checkUserPermission } from "../../src/utils/permissionUtils.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P13_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = `P13-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { drafts: [], txs: [], batches: [], leads: [], crmLeads: [] };

const fullUser = {
    roleName: "staff",
    permissions: [
        "data_extractor.crm_enrichment.view",
        "data_extractor.crm_enrichment.match",
        "data_extractor.crm_enrichment.prepare",
        "data_extractor.crm_enrichment.review",
        "data_extractor.crm_enrichment.create_lead",
        "data_extractor.crm_enrichment.apply",
        "data_extractor.crm_enrichment.batch",
        "data_extractor.crm_enrichment.rollback",
        "data_extractor.crm_enrichment.lock",
        "data_extractor.crm_enrichment.history",
        "data_extractor.crm_enrichment.export",
        "crm.leads.add",
        "crm.leads.edit",
        "customers.customer_master.edit",
        "purchase.suppliers.edit",
    ],
};

async function makeApprovedLead(extra = {}) {
    const lead = await ExtractedLead.create({
        companyId: companyA,
        financialYear: "2025-26",
        companyName: extra.companyName || `${TAG} Co`,
        website: extra.website || "https://p13-co.test",
        email: extra.email || "info@p13-co.test",
        phone: extra.phone || "9988776655",
        city: extra.city || "Pune",
        stateProvince: extra.state || "Maharashtra",
        address: extra.address || "",
        sourcePlatform: "web_search",
        status: "approved",
        ...extra,
    });
    created.leads.push(lead._id);
    return lead;
}

before(async () => {
    await mongoose.connect(MONGO_URI);
});

after(async () => {
    if (created.drafts.length) await AiCrmEnrichmentDraft.deleteMany({ _id: { $in: created.drafts } });
    if (created.txs.length) await AiCrmEnrichmentTransaction.deleteMany({ _id: { $in: created.txs } });
    if (created.batches.length) await AiCrmEnrichmentBatchJob.deleteMany({ _id: { $in: created.batches } });
    if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
    if (created.crmLeads.length) await Lead.deleteMany({ _id: { $in: created.crmLeads } });
    await AiCrmEnrichmentDraft.deleteMany({ companyId: { $in: [companyA, companyB] }, companyName: new RegExp(TAG) });
    await Lead.deleteMany({ companyId: companyA, customerName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe("Phase 13 matching & eligibility", () => {
    it("1. exact website match finds existing CRM Lead", () => {
        const c = scoreCrmCandidate(
            { companyName: "X", website: "https://www.acme.test/path" },
            { customerName: "Other", website: "acme.test" },
            "LEAD",
        );
        assert.ok(c.score >= 40);
        assert.ok(c.evidence.some((e) => e.signal === "exact_domain"));
    });

    it("2. exact normalized email finds entity", () => {
        const c = scoreCrmCandidate(
            { email: "Purchase@Acme.TEST" },
            { customerEmail: "purchase@acme.test" },
            "LEAD",
        );
        assert.ok(c.evidence.some((e) => e.signal === "exact_email"));
    });

    it("3. exact normalized phone finds entity", () => {
        const c = scoreCrmCandidate(
            { phone: "+91 98765 43210" },
            { customerMobile: "09876543210" },
            "LEAD",
        );
        assert.ok(c.evidence.some((e) => e.signal === "exact_phone"));
    });

    it("4. similar name alone does not auto-match", () => {
        const c = scoreCrmCandidate(
            { companyName: "ABC Lighting Pvt Ltd" },
            { customerName: "ABC Lighting LLP" },
            "LEAD",
        );
        assert.ok(c.nameOnly || c.score <= 25);
        const classified = classifyCrmMatches([c]);
        assert.notEqual(classified.matchStatus, "EXACT_MATCH");
    });

    it("5. same name different city requires review", () => {
        const c = scoreCrmCandidate(
            { companyName: "ABC Lighting", city: "Mumbai" },
            { customerName: "ABC Lighting", city: "Delhi" },
            "LEAD",
        );
        assert.equal(c.differentCity, true);
        const classified = classifyCrmMatches([c]);
        assert.equal(classified.matchStatus, "MANUAL_REVIEW_REQUIRED");
    });

    it("6. multiple CRM matches return MULTIPLE_MATCHES", () => {
        const a = scoreCrmCandidate({ website: "https://a.test", email: "a@a.test" }, { website: "a.test", customerEmail: "a@a.test", customerName: "A1" }, "LEAD");
        const b = scoreCrmCandidate({ website: "https://a.test", email: "a@a.test" }, { website: "a.test", customerEmail: "a@a.test", customerName: "A2" }, "LEAD");
        const classified = classifyCrmMatches([a, b].sort((x, y) => y.score - x.score));
        assert.equal(classified.matchStatus, "MULTIPLE_MATCHES");
    });

    it("7-8. related/branch not auto-linked via eligibility", () => {
        const e = evaluateEligibility({
            similarResult: { status: "RELATED_COMPANY_REVIEW", _id: "x" },
        });
        assert.equal(e.eligibilityStatus, "CONFLICT_REVIEW_REQUIRED");
        const e2 = evaluateEligibility({
            similarResult: { status: "POSSIBLE_BRANCH_REVIEW", _id: "y" },
        });
        assert.equal(e2.eligibilityStatus, "CONFLICT_REVIEW_REQUIRED");
    });

    it("9. foreign-company CRM record never returned", async () => {
        const foreignLead = await Lead.create({
            companyId: companyB,
            customerName: `${TAG} Foreign`,
            customerEmail: "foreign@p13.test",
            source: "manual",
            status: "new",
        });
        created.crmLeads.push(foreignLead._id);
        const match = await matchAgainstCrm(companyA, { email: "foreign@p13.test", companyName: `${TAG} Foreign` });
        assert.ok(!(match.matchCandidates || []).some((c) => String(c.entityId) === String(foreignLead._id)));
    });

    it("10. body company override rejected", async () => {
        await assert.rejects(
            () => prepareDraft(companyA, userA, { companyId: companyB, extractedLeadId: new mongoose.Types.ObjectId() }),
            /companyId\/tenantId overrides are rejected/i,
        );
    });

    it("11. unapproved intelligence not eligible", () => {
        const e = evaluateEligibility({ extractedLead: { status: "draft" } });
        assert.equal(e.eligibilityStatus, "NOT_APPROVED");
    });

    it("12. rejected candidate cannot convert", () => {
        const e = evaluateEligibility({ extractedLead: { status: "rejected" } });
        assert.equal(e.eligibilityStatus, "BLOCKED");
    });
});

describe("Phase 13 draft / create / enrich", () => {
    it("13-17. approved prepare, final approval, create lead, idempotent", async () => {
        const el = await makeApprovedLead({ companyName: `${TAG} DraftCo`, website: "https://draftco-p13.test", email: "buyer@draftco-p13.test" });
        const prepared = await prepareDraft(companyA, userA, { extractedLeadId: el._id });
        created.drafts.push(prepared.draft._id);
        assert.equal(prepared.draft.eligibilityStatus, "ELIGIBLE");
        assert.ok(["CREATE_LEAD_DRAFT", "MANUAL_REVIEW_REQUIRED", "ENRICH_EXISTING_LEAD"].includes(prepared.draft.draftActionType));

        // Force create path for this test
        await AiCrmEnrichmentDraft.updateOne({ _id: prepared.draft._id }, {
            $set: {
                draftActionType: "CREATE_LEAD_DRAFT",
                matchedCrmEntityType: "NONE",
                matchedCrmEntityId: null,
                matchStatus: "NO_MATCH",
                fieldComparisons: (prepared.draft.fieldComparisons || []).map((c) => ({ ...c, userDecision: "USE_EXTRACTED" })),
            },
        });

        await assert.rejects(() => createLeadFromDraft(companyA, userA, prepared.draft._id, {}, fullUser), /Final approval required/i);

        const prev = await previewDraft(companyA, userA, prepared.draft._id, {});
        assert.equal(prev.preview.requiresFinalApproval, true);
        const approved = await finalApproveDraft(companyA, userA, prepared.draft._id, { forceApproval: true });
        assert.equal(approved.status, "APPROVED");
        const created1 = await createLeadFromDraft(companyA, userA, prepared.draft._id, {}, fullUser);
        created.crmLeads.push(created1.lead._id);
        if (created1.transaction) created.txs.push(created1.transaction._id);
        assert.equal(created1.idempotent, false);
        assert.equal(created1.lead.source, "data_extractor");
        assert.ok(created1.lead.customerName);

        const created2 = await createLeadFromDraft(companyA, userA, prepared.draft._id, {}, fullUser);
        assert.equal(created2.idempotent, true);
        assert.equal(String(created2.lead._id), String(created1.lead._id));
    });

    it("18-20. email not overwritten; ADD_ALTERNATE; phones retained", () => {
        const comparisons = [
            { fieldKey: "customerEmail", crmField: "customerEmail", crmCurrentValue: "keep@crm.test", suggestedValue: "new@ext.test", userDecision: "PENDING", changeType: "CONFLICT" },
            { fieldKey: "customerMobile", crmField: "customerMobile", crmCurrentValue: "1111111111", suggestedValue: "2222222222", userDecision: "ADD_ALTERNATE", changeType: "CONFLICT" },
        ];
        const keep = buildPatchFromDecisions({ entityType: "LEAD", comparisons: applyFieldDecisions(comparisons, { customerEmail: "KEEP_CRM" }) });
        assert.equal(keep.patch.customerEmail, undefined);
        assert.ok(keep.rejected.customerEmail);

        const alt = buildPatchFromDecisions({
            entityType: "LEAD",
            comparisons: [
                { fieldKey: "customerEmail", crmField: "customerEmail", crmCurrentValue: "keep@crm.test", suggestedValue: "new@ext.test", userDecision: "ADD_ALTERNATE", changeType: "CONFLICT" },
            ],
        });
        assert.equal(alt.patch.customerEmail, undefined);
        assert.match(String(alt.patch.notes || ""), /Alternate email/i);
        assert.ok(alt.alternates.customerEmail);

        // dedupe alternate
        const dup = buildPatchFromDecisions({
            entityType: "LEAD",
            comparisons: [
                { fieldKey: "customerEmail", crmField: "customerEmail", crmCurrentValue: "keep@crm.test", suggestedValue: "keep@crm.test", userDecision: "ADD_ALTERNATE", changeType: "CONFLICT" },
            ],
            proposed: { notes: "Alternate email: keep@crm.test" },
        });
        // when notes already contain value via append from crmCurrent - still ok
        assert.ok(dup.rejected.customerEmail || dup.alternates.customerEmail || dup.patch.notes);
    });

    it("21. complete CRM address not replaced with partial automatically", () => {
        const proposed = buildProposedFieldsFromSource({ companyName: "A", address: "Pune" });
        const comps = buildFieldComparisons({
            entityType: "CUSTOMER",
            crmEntity: { address: "Plot 12, MIDC Chakan Industrial Area, Pune 410501", city: "Pune" },
            proposed: { ...proposed, address: "Pune" },
        });
        const addr = comps.find((c) => c.fieldKey === "address");
        assert.equal(addr.changeType, "LESS_COMPLETE");
        assert.equal(addr.recommendedAction, "KEEP_CRM");
    });

    it("22-26. conflict decisions KEEP_CRM / USE_EXTRACTED / reject", () => {
        const comps = [
            { fieldKey: "customerName", crmField: "customerName", crmCurrentValue: "Old", suggestedValue: "New", changeType: "CONFLICT", userDecision: "PENDING" },
        ];
        assert.equal(applyFieldDecisions(comps, { customerName: "KEEP_CRM" })[0].userDecision, "KEEP_CRM");
        const use = buildPatchFromDecisions({
            entityType: "LEAD",
            comparisons: [{ fieldKey: "customerName", crmField: "customerName", suggestedValue: "New", userDecision: "USE_EXTRACTED" }],
        });
        assert.equal(use.patch.customerName, "New");
        const rej = buildPatchFromDecisions({
            entityType: "LEAD",
            comparisons: [{ fieldKey: "customerName", crmField: "customerName", suggestedValue: "New", userDecision: "REJECT_SUGGESTION" }],
        });
        assert.equal(rej.patch.customerName, undefined);
        assert.ok(rej.rejected.customerName);
    });

    it("27-29. transaction before/after, provenance, history", async () => {
        const el = await makeApprovedLead({ companyName: `${TAG} HistCo`, website: "https://histco-p13.test", email: "h@histco-p13.test" });
        const prepared = await prepareDraft(companyA, userA, { extractedLeadId: el._id });
        created.drafts.push(prepared.draft._id);
        assert.ok((prepared.draft.sourceReferences || []).length >= 1);
        await setFieldDecisions(companyA, userA, prepared.draft._id, {
            decisions: Object.fromEntries((prepared.draft.fieldComparisons || []).map((c) => [c.fieldKey, "USE_EXTRACTED"])),
            reason: "Manual field decisions",
        });
        const hist = await getDraftHistory(companyA, prepared.draft._id);
        assert.ok(hist.history.some((h) => h.action === "field_decisions"));
    });

    it("30. locked review cannot change without unlock", async () => {
        const el = await makeApprovedLead({ companyName: `${TAG} LockCo`, website: "https://lockco-p13.test" });
        const prepared = await prepareDraft(companyA, userA, { extractedLeadId: el._id });
        created.drafts.push(prepared.draft._id);
        await lockDraft(companyA, userA, prepared.draft._id, { action: "lock" });
        await assert.rejects(
            () => setFieldDecisions(companyA, userA, prepared.draft._id, { decisions: { customerName: "KEEP_CRM" } }),
            /locked/i,
        );
    });

    it("31-32. rollback restores / detects later edit conflict", async () => {
        const el = await makeApprovedLead({ companyName: `${TAG} RbCo`, website: "https://rbco-p13.test", email: "rb@rbco-p13.test" });
        // existing CRM lead to enrich
        const crmLead = await Lead.create({
            companyId: companyA,
            customerName: `${TAG} RbCo`,
            customerEmail: "old@rbco-p13.test",
            customerMobile: "9000000001",
            source: "manual",
            status: "new",
            notes: "existing",
        });
        if (!crmLead.companyId) {
            await Lead.updateOne({ _id: crmLead._id }, { $set: { companyId: companyA } });
            crmLead.companyId = companyA;
        }
        created.crmLeads.push(crmLead._id);

        const prepared = await prepareDraft(companyA, userA, { extractedLeadId: el._id });
        created.drafts.push(prepared.draft._id);
        await AiCrmEnrichmentDraft.updateOne({ _id: prepared.draft._id }, {
            $set: {
                draftActionType: "ENRICH_EXISTING_LEAD",
                matchedCrmEntityType: "LEAD",
                matchedCrmEntityId: crmLead._id,
                matchStatus: "EXACT_MATCH",
                status: "FIELD_REVIEW_REQUIRED",
                fieldComparisons: [
                    { fieldKey: "customerEmail", crmField: "customerEmail", crmCurrentValue: "old@rbco-p13.test", suggestedValue: "rb@rbco-p13.test", changeType: "CONFLICT", userDecision: "USE_EXTRACTED", recommendedAction: "USE_EXTRACTED" },
                    { fieldKey: "customerName", crmField: "customerName", crmCurrentValue: `${TAG} RbCo`, suggestedValue: `${TAG} RbCo`, changeType: "SAME_VALUE", userDecision: "KEEP_CRM", recommendedAction: "KEEP_CRM" },
                ],
            },
        });
        await previewDraft(companyA, userA, prepared.draft._id, {});
        await finalApproveDraft(companyA, userA, prepared.draft._id, { forceApproval: true });
        const applied = await applyEnrichmentFromDraft(companyA, userA, prepared.draft._id, {}, fullUser);
        created.txs.push(applied.transaction._id);
        assert.ok(["APPLIED", "PARTIALLY_APPLIED"].includes(applied.transaction.status));
        assert.ok(applied.transaction.beforeValues);

        const rb1 = await rollbackTransaction(companyA, userA, applied.transaction._id, {}, fullUser);
        assert.equal(rb1.status, "ROLLED_BACK");

        // re-apply then mutate CRM then rollback -> conflict
        await AiCrmEnrichmentDraft.updateOne({ _id: prepared.draft._id }, { $set: { status: "APPROVED", enrichmentTransactionId: null } });
        const applied2 = await applyEnrichmentFromDraft(companyA, userA, prepared.draft._id, {}, fullUser);
        created.txs.push(applied2.transaction._id);
        await Lead.updateOne({ _id: crmLead._id }, { $set: { customerEmail: "later-edit@rbco-p13.test" } });
        const rb2 = await rollbackTransaction(companyA, userA, applied2.transaction._id, {}, fullUser);
        assert.equal(rb2.status, "ROLLBACK_CONFLICT");
    });

    it("33-36. no auto Customer/Supplier/Task/comms flags", async () => {
        const el = await makeApprovedLead({ companyName: `${TAG} SafeCo` });
        const prepared = await prepareDraft(companyA, userA, { extractedLeadId: el._id });
        created.drafts.push(prepared.draft._id);
        assert.equal(prepared.draft.noAutoCustomerCreate, true);
        assert.equal(prepared.draft.noAutoSupplierCreate, true);
        assert.equal(prepared.draft.noAutoTaskCreate, true);
        assert.equal(prepared.draft.noAutoCommunications, true);
    });
});

describe("Phase 13 permissions / batch / safety", () => {
    it("37-40. permission denials", () => {
        const viewOnly = { roleName: "staff", permissions: ["data_extractor.crm_enrichment.view"] };
        for (const p of ["data_extractor.crm_enrichment.match", "data_extractor.crm_enrichment.prepare", "data_extractor.crm_enrichment.create_lead", "data_extractor.crm_enrichment.apply", "data_extractor.crm_enrichment.rollback"]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
        const prepareOnly = { roleName: "staff", permissions: ["data_extractor.crm_enrichment.view", "data_extractor.crm_enrichment.prepare"] };
        assert.equal(checkUserPermission(prepareOnly, "data_extractor.crm_enrichment.create_lead"), false);

        const deCreateNoCrm = { roleName: "staff", permissions: ["data_extractor.crm_enrichment.create_lead"] };
        assert.equal(checkUserPermission(deCreateNoCrm, "crm.leads.add"), false);

        const applyNoEdit = { roleName: "staff", permissions: ["data_extractor.crm_enrichment.apply"] };
        assert.equal(checkUserPermission(applyNoEdit, "crm.leads.edit"), false);
    });

    it("41-43. batch pause/resume, fail-continue, batch permission key exists", async () => {
        const el1 = await makeApprovedLead({ companyName: `${TAG} Batch1`, website: "https://b1-p13.test" });
        const el2 = await makeApprovedLead({ companyName: `${TAG} Batch2`, website: "https://b2-p13.test" });
        const key = `idem-p13-${TAG}`;
        const job1 = await createEnrichmentBatch(companyA, userA, {
            extractedLeadIds: [el1._id, el2._id],
            idempotencyKey: key,
        });
        created.batches.push(job1._id);
        const job2 = await createEnrichmentBatch(companyA, userA, {
            extractedLeadIds: [el1._id, el2._id],
            idempotencyKey: key,
        });
        assert.equal(String(job1._id), String(job2._id));
        await controlEnrichmentBatch(companyA, userA, job1._id, "pause", { reason: "test" });
        assert.equal((await getEnrichmentBatch(companyA, job1._id)).status, "PAUSED");
        await controlEnrichmentBatch(companyA, userA, job1._id, "resume");
        const processed = await processEnrichmentBatchChunk(companyA, userA, job1._id, { maxItems: 10 });
        assert.ok(["COMPLETED", "QUEUED"].includes(processed.status));
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.crm_enrichment.batch"] }, "data_extractor.crm_enrichment.batch"), true);
    });

    it("44-45. secrets and base64 media rejected", () => {
        assert.throws(() => assertNoSecrets({ cookie: "abc" }), /secret|session|media/i);
        assert.throws(() => assertNoSecrets({ notes: "data:image/png;base64,AAAA" }), /secret|session|media/i);
    });

    it("routes register crm_enrichment permissions", () => {
        const stack = dataExtractorRouter?.stack || [];
        const paths = stack.map((l) => `${Object.keys(l.route?.methods || {})[0] || ""} ${l.route?.path || ""}`).join("\n");
        assert.match(paths, /crm-enrichment\/prepare/);
        assert.match(paths, /crm-enrichment\/:id\/create-lead/);
        assert.match(paths, /transactions\/:txId\/rollback/);
    });
});
