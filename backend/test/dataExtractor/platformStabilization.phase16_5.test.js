/**
 * Phase 16.5 — Platform stabilization / golden integration checks.
 * No Phase 17. No communication execution.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { ExtractedLead } from "../../src/models/extractedLead.model.js";
import { AiLeadRelevance } from "../../src/models/aiLeadRelevance.model.js";
import { AiLeadScore } from "../../src/models/aiLeadScore.model.js";
import { AiCrmEnrichmentDraft } from "../../src/models/aiCrmEnrichmentDraft.model.js";
import { AiCrmEnrichmentTransaction } from "../../src/models/aiCrmEnrichmentTransaction.model.js";
import { AiSalesWorkflowDraft } from "../../src/models/aiSalesWorkflowDraft.model.js";
import { AiSalesWorkflowTransaction } from "../../src/models/aiSalesWorkflowTransaction.model.js";
import EmailBlacklist from "../../src/models/emailBlacklist.model.js";
import { KPI_DEFINITIONS } from "../../src/services/dataExtractor/analytics/constants.js";
import { getExecutiveSummary } from "../../src/services/dataExtractor/analytics/aggregate.service.js";
import { parseAnalyticsFilters, assertNoSecrets as assertNoSecretsAnalytics } from "../../src/services/dataExtractor/analytics/filters.util.js";
import { isAggregateOnly } from "../../src/services/dataExtractor/analytics/permissions.util.js";
import {
  createCampaign, buildAudience, listRecipients, prepareHandoff, setApprovals, finalApprove,
} from "../../src/services/dataExtractor/marketingIntelligence/campaign.service.js";
import { assertNoSecrets as assertNoSecretsMi, rejectTenantOverrides } from "../../src/services/dataExtractor/marketingIntelligence/normalize.util.js";
import { checkOptOut, getEmailBlacklistSet } from "../../src/services/dataExtractor/marketingIntelligence/optout.adapter.js";
import { checkFrequency } from "../../src/services/dataExtractor/marketingIntelligence/frequency.adapter.js";
import { normalizeMarketingSettings } from "../../src/services/dataExtractor/marketingIntelligence/settings.service.js";
import { dedupeRecipients } from "../../src/services/dataExtractor/marketingIntelligence/duplicate.service.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P165_MONGO_URI || process.env.P16_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = "P165-" + Date.now();
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const ids = { leads: [], scores: [], rel: [], camps: [], bl: [], drafts13: [], txs13: [], drafts14: [], txs14: [] };

const MI_PERMS = [
  "data_extractor.marketing_intelligence.view",
  "data_extractor.marketing_intelligence.create",
  "data_extractor.marketing_intelligence.build_audience",
  "data_extractor.marketing_intelligence.review_recipients",
  "data_extractor.marketing_intelligence.approve_audience",
  "data_extractor.marketing_intelligence.approve_message",
  "data_extractor.marketing_intelligence.approve_content",
  "data_extractor.marketing_intelligence.approve_handoff",
  "data_extractor.marketing_intelligence.prepare_handoff",
  "data_extractor.marketing_intelligence.generate_message",
  "data_extractor.marketing_intelligence.manage",
  "crm.leads.view",
];
const fullUser = { id: userA, _id: userA, roleName: "staff", permissions: MI_PERMS };
const aggregateUser = {
  id: userA, _id: userA, roleName: "staff",
  permissions: ["data_extractor.marketing_intelligence.view", "data_extractor.analytics.view", "data_extractor.analytics.executive"],
};

before(async () => {
  await mongoose.connect(MONGO_URI);

  // Scenario A — clean approved prospect
  const clean = await ExtractedLead.create({
    companyId: companyA, financialYear: "2025-26", companyName: TAG + " Clean Co",
    email: "dm@" + TAG.toLowerCase() + ".test", phone: "9123456789", city: "Pune",
    industry: "Manufacturing", sourcePlatform: "web_search", status: "approved",
    contactName: "Decision Maker", contactRole: "Owner",
  });
  ids.leads.push(clean._id);

  // Scenario C twin duplicate
  const dup = await ExtractedLead.create({
    companyId: companyA, financialYear: "2025-26", companyName: TAG + " Clean Co Dup",
    email: "dm@" + TAG.toLowerCase() + ".test", phone: "9123456789",
    sourcePlatform: "web_search", status: "duplicate", duplicateStatus: "confirmed_duplicate",
  });
  ids.leads.push(dup._id);

  // Scenario D rejected
  const rej = await ExtractedLead.create({
    companyId: companyA, financialYear: "2025-26", companyName: TAG + " Rejected",
    email: "rej@" + TAG.toLowerCase() + ".test", sourcePlatform: "web_search", status: "rejected",
  });
  ids.leads.push(rej._id);

  // Scenario H foreign
  const foreign = await ExtractedLead.create({
    companyId: companyB, financialYear: "2025-26", companyName: TAG + " Foreign",
    email: "f@" + TAG.toLowerCase() + ".test", sourcePlatform: "web_search", status: "approved",
  });
  ids.leads.push(foreign._id);

  ids.rel.push((await AiLeadRelevance.create({
    companyId: companyA, extractedLeadId: clean._id, status: "RELEVANT", relevanceScore: 80,
  }))._id);

  ids.scores.push((await AiLeadScore.create({
    companyId: companyA, extractedLeadId: clean._id, finalScore: 88, priority: "HIGH", grade: "A", status: "APPROVED",
  }))._id);

  // Scenario E opt-out
  await EmailBlacklist.create({
    companyId: companyA, email: "optout@" + TAG.toLowerCase() + ".test", source: "unsubscribe", isActive: true,
  });

  // Scenario B/G — Phase 13 draft vs applied distinction fixtures
  ids.drafts13.push((await AiCrmEnrichmentDraft.create({
    companyId: companyA, recordKey: TAG + ":draft13", extractedLeadId: clean._id,
    status: "READY_FOR_APPROVAL", draftActionType: "CREATE_LEAD_DRAFT",
  }))._id);
  ids.txs13.push((await AiCrmEnrichmentTransaction.create({
    companyId: companyA, draftId: ids.drafts13[0], actionType: "CREATE_LEAD_DRAFT", status: "APPROVED",
    crmEntityType: "LEAD", crmEntityId: new mongoose.Types.ObjectId(),
  }))._id);

  ids.drafts14.push((await AiSalesWorkflowDraft.create({
    companyId: companyA, recordKey: TAG + ":draft14", crmLeadId: new mongoose.Types.ObjectId(),
    status: "READY_FOR_APPROVAL", eligibilityStatus: "ELIGIBLE",
  }))._id);
});

after(async () => {
  await ExtractedLead.deleteMany({ _id: { $in: ids.leads } });
  await AiLeadRelevance.deleteMany({ _id: { $in: ids.rel } });
  await AiLeadScore.deleteMany({ _id: { $in: ids.scores } });
  await AiCrmEnrichmentDraft.deleteMany({ _id: { $in: ids.drafts13 } });
  await AiCrmEnrichmentTransaction.deleteMany({ _id: { $in: ids.txs13 } });
  await AiSalesWorkflowDraft.deleteMany({ _id: { $in: ids.drafts14 } });
  await EmailBlacklist.deleteMany({ companyId: companyA, email: "optout@" + TAG.toLowerCase() + ".test" });
  await mongoose.disconnect();
});

describe("Phase 16.5 golden scenarios A–H core", () => {
  it("A/C/D/H. clean pipeline counts; duplicates/rejected/foreign excluded from audience", async () => {
    const camp = await createCampaign(companyA, userA, {
      name: TAG + " Golden A",
      campaignType: "PRODUCT_INTRODUCTION",
      channelDraftType: "EMAIL_DRAFT",
      audienceFilters: {},
      idempotencyKey: TAG + "-golden-a",
    }, fullUser);
    ids.camps = ids.camps || [];
    // build with settings that allow unverified
    const { saveMarketingSettings } = await import("../../src/services/dataExtractor/marketingIntelligence/settings.service.js");
    await saveMarketingSettings(companyA, userA, {
      requireVerifiedEmail: false, requireVerifiedPhone: false, allowGenericContacts: true,
      frequencyCheckRequired: false, previewConfirmThreshold: 100000,
    });
    const built = await buildAudience(companyA, userA, camp.campaign._id, { confirmLargeAudience: true }, fullUser);
    assert.ok(built.stats.totalCandidates >= 1);
    const rec = await listRecipients(companyA, camp.campaign._id, {}, fullUser);
    const names = rec.items.map((r) => String(r.companyName || ""));
    assert.equal(names.some((n) => n.includes("Foreign")), false);
    assert.equal(names.some((n) => n.includes("Rejected") && rec.items.find((x) => x.companyName === n)?.included), false);
    // same email should not appear twice as included duplicates
    const emails = rec.items.filter((r) => r.included).map((r) => r.normalizedEmail).filter(Boolean);
    assert.equal(new Set(emails).size, emails.length);

    // analytics company scope
    const filters = parseAnalyticsFilters({ dateRange: "last_30_days" });
    const exec = await getExecutiveSummary(companyA, filters, fullUser);
    assert.ok(exec);
    assert.equal(KPI_DEFINITIONS.uniqueCompanies.metricType, "unique_company_count");
    assert.match(KPI_DEFINITIONS.uniqueCompanies.definition, /approximat/i);
  });

  it("E. opted-out contact excluded from email channel", async () => {
    const set = await getEmailBlacklistSet(companyA);
    const r = checkOptOut({
      email: "optout@" + TAG.toLowerCase() + ".test",
      phone: "",
      channelDraftType: "EMAIL_DRAFT",
      emailBlacklist: set,
      whatsappBlacklist: new Set(),
    });
    assert.equal(r.status, "OPTED_OUT");
  });

  it("B/G draft vs applied counting", async () => {
    const draft13 = await AiCrmEnrichmentDraft.findById(ids.drafts13[0]).lean();
    assert.notEqual(draft13.status, "CONVERTED_TO_LEAD");
    const tx = await AiCrmEnrichmentTransaction.findById(ids.txs13[0]).lean();
    assert.notEqual(tx.status, "APPLIED");
    const sw = await AiSalesWorkflowDraft.findById(ids.drafts14[0]).lean();
    assert.ok(["READY_FOR_APPROVAL", "DRAFT", "RECOMMENDATION_READY"].includes(sw.status));
    assert.notEqual(sw.status, "ASSIGNMENT_APPLIED");
  });

  it("H. tenant overrides rejected; foreign campaign inaccessible", async () => {
    assert.throws(() => rejectTenantOverrides({ companyId: String(companyB) }), /companyId\/tenantId/);
    assert.throws(() => rejectTenantOverrides({ tenantId: "x" }), /companyId\/tenantId/);
    await assert.rejects(
      () => createCampaign(companyA, userA, { companyId: companyB, name: "bad" }, fullUser),
      /companyId\/tenantId/,
    );
  });

  it("F. locked marketing draft not outdated silently", async () => {
    const { lockCampaign, markOutdatedIfNeeded } = await import("../../src/services/dataExtractor/marketingIntelligence/campaign.service.js");
    const camp = await createCampaign(companyA, userA, {
      name: TAG + " Lock",
      campaignType: "MANUAL_CUSTOM",
      channelDraftType: "EXPORT_ONLY",
      idempotencyKey: TAG + "-lock",
    }, fullUser);
    await lockCampaign(companyA, userA, camp.campaign._id, { action: "lock" }, fullUser);
    const out = await markOutdatedIfNeeded(companyA, camp.campaign._id, ["OUTDATED_CONTACT"]);
    assert.equal(out.locked, true);
    assert.notEqual(out.status, "OUTDATED");
  });
});

describe("Phase 16.5 privacy / marketing / routes / secrets", () => {
  it("aggregate-only strips contacts; history unavailable; handoff non-executable path gates", async () => {
    assert.equal(isAggregateOnly(aggregateUser, "contact"), true);
    const freq = await checkFrequency({
      companyId: companyA, email: "nosuch-" + TAG + "@test.local", phone: "",
      campaignType: "PRODUCT_INTRODUCTION", settings: normalizeMarketingSettings({}),
    });
    assert.ok(["SAFE_TO_CONTACT", "HISTORY_UNAVAILABLE"].includes(freq.status));

    const camp = await createCampaign(companyA, userA, {
      name: TAG + " Agg", campaignType: "MANUAL_CUSTOM", channelDraftType: "EXPORT_ONLY",
      idempotencyKey: TAG + "-agg2",
    }, fullUser);
    const { saveMarketingSettings } = await import("../../src/services/dataExtractor/marketingIntelligence/settings.service.js");
    await saveMarketingSettings(companyA, userA, {
      requireVerifiedEmail: false, requireVerifiedPhone: false, allowGenericContacts: true,
      frequencyCheckRequired: false, previewConfirmThreshold: 100000,
    });
    await buildAudience(companyA, userA, camp.campaign._id, { confirmLargeAudience: true }, fullUser);
    const agg = await listRecipients(companyA, camp.campaign._id, {}, aggregateUser);
    assert.equal(agg.aggregateOnly, true);
    assert.ok(agg.items.every((r) => r.email == null && r.phone == null));

    await assert.rejects(() => prepareHandoff(companyA, userA, camp.campaign._id, {}, fullUser), /approval|Final handoff/i);
  });

  it("no send/execute routes; secrets rejected; dedupe CRM cross-source", () => {
    const paths = (dataExtractorRouter.stack || []).map((l) => l.route?.path).filter(Boolean).join(" ");
    assert.equal(/marketing-intelligence.*\/send\b/.test(paths), false);
    assert.equal(/marketing-intelligence.*\/execute\b/.test(paths), false);
    assert.equal(/analytics.*\/send\b/.test(paths), false);
    assert.match(paths, /marketing-intelligence\/campaigns/);
    assert.match(paths, /analytics\/executive/);
    assert.throws(() => assertNoSecretsMi({ password: "x" }), /secret/i);
    assert.throws(() => assertNoSecretsAnalytics({ cookie: "a=b" }), /secret|Refusing/i);
    const rows = dedupeRecipients([
      { normalizedEmail: "a@x.com", normalizedPhone: "91", included: true, eligibilityStatus: "ELIGIBLE", crmLeadId: "L1", extractedLeadId: "1" },
      { normalizedEmail: "b@x.com", normalizedPhone: "92", included: true, eligibilityStatus: "ELIGIBLE", crmLeadId: "L1", extractedLeadId: "2" },
    ]);
    assert.ok(rows.some((r) => r.eligibilityStatus === "DUPLICATE_CONTACT" || r.duplicateStatus === "CROSS_SOURCE_DUPLICATE"));
  });

  it("KPI definitions distinguish drafts vs applied labels", () => {
    assert.match(KPI_DEFINITIONS.crmLeadsCreated.definition, /Phase 13|APPLIED|created/i);
    assert.match(KPI_DEFINITIONS.assignmentsApplied.definition, /Phase 14|APPLIED/i);
    assert.match(KPI_DEFINITIONS.tasksCreated.definition, /Phase 14/i);
  });
});
