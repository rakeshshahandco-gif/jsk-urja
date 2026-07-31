/**
 * Phase 16 - Campaign and Marketing Intelligence (draft-only, no send).
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { ExtractedLead } from "../../src/models/extractedLead.model.js";
import EmailBlacklist from "../../src/models/emailBlacklist.model.js";
import WhatsAppBulkBlacklist from "../../src/models/whatsappBulkBlacklist.model.js";
import { AiProductMaster } from "../../src/models/aiProductMaster.model.js";
import { AiMarketingCampaignDraft } from "../../src/models/aiMarketingCampaignDraft.model.js";
import { AiMarketingCampaignRecipient } from "../../src/models/aiMarketingCampaignRecipient.model.js";
import { AiMarketingCampaignBatchJob } from "../../src/models/aiMarketingCampaignBatchJob.model.js";
import { assertNoSecrets, normalizePhone, isValidEmail, isValidPhone, isGenericEmail } from "../../src/services/dataExtractor/marketingIntelligence/normalize.util.js";
import { validateAudienceFilters } from "../../src/services/dataExtractor/marketingIntelligence/filters.util.js";
import { matchContactRole, selectContact } from "../../src/services/dataExtractor/marketingIntelligence/contactMatch.service.js";
import { evaluateRecipientEligibility } from "../../src/services/dataExtractor/marketingIntelligence/eligibility.service.js";
import { checkOptOut, getEmailBlacklistSet, getWhatsAppBlacklistSet } from "../../src/services/dataExtractor/marketingIntelligence/optout.adapter.js";
import { checkFrequency } from "../../src/services/dataExtractor/marketingIntelligence/frequency.adapter.js";
import { dedupeRecipients } from "../../src/services/dataExtractor/marketingIntelligence/duplicate.service.js";
import { recommendContent } from "../../src/services/dataExtractor/marketingIntelligence/content.service.js";
import { generateMessageDraft, resolvePersonalization } from "../../src/services/dataExtractor/marketingIntelligence/message.service.js";
import { createCampaign, getCampaign, buildAudience, listRecipients, setApprovals, finalApprove, prepareHandoff, lockCampaign, exportCampaign, markOutdatedIfNeeded, cancelCampaign } from "../../src/services/dataExtractor/marketingIntelligence/campaign.service.js";
import { createBatch, processBatchChunk, controlBatch } from "../../src/services/dataExtractor/marketingIntelligence/batch.service.js";
import { normalizeMarketingSettings, saveMarketingSettings } from "../../src/services/dataExtractor/marketingIntelligence/settings.service.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P16_MONGO_URI || process.env.P15_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = `P16-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { leads: [], campaigns: [], products: [], batches: [] };
const ALL_MI = ["data_extractor.marketing_intelligence.view","data_extractor.marketing_intelligence.create","data_extractor.marketing_intelligence.build_audience","data_extractor.marketing_intelligence.review_recipients","data_extractor.marketing_intelligence.review_duplicates","data_extractor.marketing_intelligence.review_optout","data_extractor.marketing_intelligence.generate_message","data_extractor.marketing_intelligence.edit_message","data_extractor.marketing_intelligence.approve_audience","data_extractor.marketing_intelligence.approve_message","data_extractor.marketing_intelligence.approve_content","data_extractor.marketing_intelligence.approve_handoff","data_extractor.marketing_intelligence.prepare_handoff","data_extractor.marketing_intelligence.batch","data_extractor.marketing_intelligence.lock","data_extractor.marketing_intelligence.history","data_extractor.marketing_intelligence.export","data_extractor.marketing_intelligence.manage","crm.leads.view"];
const fullUser = { id: userA, _id: userA, roleName: "staff", permissions: ALL_MI };
const viewOnly = { id: userA, _id: userA, roleName: "staff", permissions: ["data_extractor.marketing_intelligence.view"] };
const aggregateUser = { id: userA, _id: userA, roleName: "staff", permissions: ["data_extractor.marketing_intelligence.view","data_extractor.marketing_intelligence.export"] };

before(async () => {
    await mongoose.connect(MONGO_URI);
    await saveMarketingSettings(companyA, userA, {
        requireVerifiedEmail: false, requireVerifiedPhone: false, allowGenericContacts: true,
        allowUnverifiedManualReview: true, frequencyCheckRequired: true, AIMessageDraftEnabled: true,
        previewConfirmThreshold: 10000,
    });
    const lead = await ExtractedLead.create({
        companyId: companyA, financialYear: "2025-26", companyName: TAG + " Acme",
        email: "purchase@acme-p16.test", phone: "9876543210", city: "Pune",
        industry: "Manufacturing", sourcePlatform: "web_search", status: "approved",
        contactName: "Ravi Purchase", contactRole: "Purchase Manager",
    });
    created.leads.push(lead._id);
    created.leads.push((await ExtractedLead.create({
        companyId: companyA, financialYear: "2025-26", companyName: TAG + " Rejected",
        email: "x@rej-p16.test", sourcePlatform: "web_search", status: "rejected",
    }))._id);
    created.leads.push((await ExtractedLead.create({
        companyId: companyB, financialYear: "2025-26", companyName: TAG + " Foreign",
        email: "f@foreign-p16.test", sourcePlatform: "web_search", status: "approved",
    }))._id);
    created.products.push((await AiProductMaster.create({
        companyId: companyA, productName: TAG + " Sensor", productCategory: "Sensors",
        isActive: true, catalogUrl: "https://example.test/catalog.pdf",
    }))._id);
    await EmailBlacklist.create({ companyId: companyA, email: "optout@acme-p16.test", reason: "unsubscribe", source: "unsubscribe", isActive: true });
    await WhatsAppBulkBlacklist.create({ companyId: companyA, mobile: "911111111111", reason: "unsubscribe", source: "unsubscribe", isActive: true });
});

after(async () => {
    await AiMarketingCampaignRecipient.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await AiMarketingCampaignDraft.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await AiMarketingCampaignBatchJob.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
    await AiProductMaster.deleteMany({ _id: { $in: created.products } });
    await EmailBlacklist.deleteMany({ companyId: companyA, email: "optout@acme-p16.test" });
    await WhatsAppBulkBlacklist.deleteMany({ companyId: companyA, mobile: "911111111111" });
    await mongoose.disconnect();
});

describe("Phase 16 filters role", () => {
    it("rejects unsafe filters", () => {
        assert.throws(() => validateAudienceFilters({ $where: "1" }), /Unsafe|Unknown/);
        assert.throws(() => validateAudienceFilters({ unknownField: 1 }), /Unknown/);
        assert.equal(validateAudienceFilters({ city: "Pune" }).city, "Pune");
    });
    it("email phone role matching", () => {
        assert.equal(isValidEmail("a@b.com"), true);
        assert.equal(isValidPhone("9876543210"), true);
        assert.equal(isGenericEmail("info@x.com"), true);
        assert.equal(matchContactRole("PRODUCT_CATALOGUE", { role: "Purchase" }).level, "BEST_MATCH");
        assert.ok(["BEST_MATCH","ACCEPTABLE_MATCH"].includes(matchContactRole("PRODUCT_DATASHEET", { role: "Engineering" }).level));
        assert.ok(selectContact({
            campaignType: "PRODUCT_CATALOGUE",
            extractedLead: { email: "purchase@x.com", contactName: "A", contactRole: "Purchase", phone: "9876543210" },
            settings: { allowGenericContacts: true },
        }).selected);
    });
});

describe("Phase 16 optout dedupe", () => {
    it("opt-out duplicate frequency", async () => {
        const emailSet = await getEmailBlacklistSet(companyA);
        const waSet = await getWhatsAppBlacklistSet(companyA);
        assert.equal(emailSet.has("optout@acme-p16.test"), true);
        assert.equal(checkOptOut({ email: "optout@acme-p16.test", phone: "", channelDraftType: "EMAIL_DRAFT", emailBlacklist: emailSet, whatsappBlacklist: waSet }).status, "OPTED_OUT");
        assert.equal(checkOptOut({ email: "", phone: "911111111111", channelDraftType: "WHATSAPP_DRAFT", emailBlacklist: emailSet, whatsappBlacklist: waSet }).status, "OPTED_OUT");
        const rows = dedupeRecipients([
            { normalizedEmail: "a@x.com", normalizedPhone: "919876543210", included: true, eligibilityStatus: "ELIGIBLE", extractedLeadId: "1" },
            { normalizedEmail: "a@x.com", normalizedPhone: "919999999999", included: true, eligibilityStatus: "ELIGIBLE", extractedLeadId: "2" },
            { normalizedEmail: "c@x.com", normalizedPhone: "910000000001", included: true, eligibilityStatus: "ELIGIBLE", crmLeadId: "L1", extractedLeadId: "4" },
            { normalizedEmail: "d@x.com", normalizedPhone: "910000000002", included: true, eligibilityStatus: "ELIGIBLE", crmLeadId: "L1", extractedLeadId: "5" },
        ]);
        assert.ok(rows.some((r) => r.eligibilityStatus === "DUPLICATE_CONTACT"));
        const freq = await checkFrequency({ companyId: companyA, email: "never-seen-p16@test.local", phone: "", campaignType: "PRODUCT_INTRODUCTION", settings: normalizeMarketingSettings({}) });
        assert.ok(["SAFE_TO_CONTACT", "HISTORY_UNAVAILABLE"].includes(freq.status));
        assert.ok(normalizePhone("9876543210").startsWith("91"));
    });
});

describe("Phase 16 campaign workflow", () => {
    it("create build approve handoff no send", async () => {
        await assert.rejects(() => createCampaign(companyA, userA, { companyId: companyB, name: "bad" }, fullUser), /companyId\/tenantId/);
        const createdCamp = await createCampaign(companyA, userA, {
            name: TAG + " Intro", campaignType: "PRODUCT_INTRODUCTION", channelDraftType: "EMAIL_DRAFT",
            audienceFilters: { city: "Pune" }, idempotencyKey: TAG + "-camp-1",
        }, fullUser);
        created.campaigns.push(createdCamp.campaign._id);
        assert.equal((await createCampaign(companyA, userA, { name: TAG + " Intro", campaignType: "PRODUCT_INTRODUCTION", channelDraftType: "EMAIL_DRAFT", idempotencyKey: TAG + "-camp-1" }, fullUser)).idempotent, true);
        await assert.rejects(() => getCampaign(companyB, createdCamp.campaign._id, fullUser), /not found/i);
        const built = await buildAudience(companyA, userA, createdCamp.campaign._id, { confirmLargeAudience: true }, fullUser);
        assert.ok(built.stats.totalCandidates >= 1);
        const recipients = await listRecipients(companyA, createdCamp.campaign._id, { included: "true" }, fullUser);
        assert.equal(recipients.items.some((r) => String(r.companyName || "").includes("Foreign")), false);
        const content = await recommendContent(companyA, { campaignType: "PRODUCT_INTRODUCTION" });
        assert.equal(JSON.stringify(content).includes("base64"), false);
        const msg = await generateMessageDraft(companyA, {
            campaignType: "PRODUCT_INTRODUCTION", channelDraftType: "EMAIL_DRAFT",
            productReferences: content.productReferences,
            personalizationValues: { companyName: "Acme", contactFirstName: "Ravi", recommendedProduct: "Sensor" },
            settings: { AIMessageDraftEnabled: true },
        });
        assert.equal(msg.notSent, true);
        assert.ok(msg.aiNote);
        assert.equal(resolvePersonalization("Hi {{contactFirstName}} {{missingVar}}", { contactFirstName: "Ravi" }).includes("{{"), false);
        await assert.rejects(() => prepareHandoff(companyA, userA, createdCamp.campaign._id, {}, fullUser), /approval|Final handoff/i);
        await setApprovals(companyA, userA, createdCamp.campaign._id, { approveAudience: true, approveRecipients: true, approveMessage: true, approveContent: true }, fullUser);
        await finalApprove(companyA, userA, createdCamp.campaign._id, {}, fullUser);
        const handoff = await prepareHandoff(companyA, userA, createdCamp.campaign._id, {}, fullUser);
        assert.equal(handoff.handoff.executable, false);
        assert.equal(handoff.handoff.sendEndpoint, null);
        assertNoSecrets(handoff.handoff);
        assert.equal((await exportCampaign(companyA, createdCamp.campaign._id, {}, fullUser)).campaign.messageNotSent, true);
        await lockCampaign(companyA, userA, createdCamp.campaign._id, { action: "lock" }, fullUser);
        assert.equal((await markOutdatedIfNeeded(companyA, createdCamp.campaign._id, ["OUTDATED_CONTACT"])).locked, true);
        await lockCampaign(companyA, userA, createdCamp.campaign._id, { action: "unlock" }, fullUser);
        assert.equal((await markOutdatedIfNeeded(companyA, createdCamp.campaign._id, ["OUTDATED_PRODUCT"])).status, "OUTDATED");
    });

    it("permissions aggregate batch no send routes", async () => {
        await assert.rejects(() => createCampaign(companyA, userA, { name: TAG + " denied" }, viewOnly), /Missing permission/);
        const camp = await createCampaign(companyA, userA, { name: TAG + " Agg", campaignType: "MANUAL_CUSTOM", channelDraftType: "EXPORT_ONLY", idempotencyKey: TAG + "-agg" }, fullUser);
        created.campaigns.push(camp.campaign._id);
        await buildAudience(companyA, userA, camp.campaign._id, { confirmLargeAudience: true }, fullUser);
        const aggList = await listRecipients(companyA, camp.campaign._id, {}, aggregateUser);
        assert.equal(aggList.aggregateOnly, true);
        assert.equal(aggList.items.every((r) => r.email == null && r.phone == null), true);
        const job = await createBatch(companyA, userA, { campaignDraftId: camp.campaign._id, jobType: "build_audience", idempotencyKey: TAG + "-batch" }, fullUser);
        created.batches.push(job._id);
        await processBatchChunk(companyA, userA, job._id, { maxItems: 5 }, fullUser);
        await AiMarketingCampaignBatchJob.findByIdAndUpdate(job._id, { status: "RUNNING" });
        assert.equal((await controlBatch(companyA, userA, job._id, "pause", fullUser)).status, "PAUSED");
        assert.equal((await controlBatch(companyA, userA, job._id, "resume", fullUser)).status, "QUEUED");
        const paths = (dataExtractorRouter.stack || []).map((l) => l.route?.path).filter(Boolean).join(" ");
        assert.equal(/marketing-intelligence.*\/send\b/.test(paths), false);
        assert.equal(/marketing-intelligence.*\/execute\b/.test(paths), false);
        assert.match(paths, /marketing-intelligence\/campaigns/);
        assert.equal(evaluateRecipientEligibility({
            selected: { email: "bad", phone: "" }, channelDraftType: "EMAIL_DRAFT",
            settings: { requireVerifiedEmail: false, allowGenericContacts: true },
            optOutResult: { status: "CLEAR" }, frequencyResult: { status: "SAFE_TO_CONTACT" },
            entityStatus: "approved", contactApproved: true,
        }).status, "INVALID_EMAIL");
        await cancelCampaign(companyA, userA, camp.campaign._id, { reason: "test" }, fullUser);
        assert.throws(() => assertNoSecrets({ password: "x" }), /secret/i);
        assert.doesNotThrow(() => assertNoSecrets({ task: "sw-task-1" }));
    });
});
