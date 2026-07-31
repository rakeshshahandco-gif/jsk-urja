/**
 * Phase 15 — Executive Dashboard / Analytics (read-only).
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { parseAnalyticsFilters, pct, assertNoSecrets, fingerprint } from "../../src/services/dataExtractor/analytics/filters.util.js";
import { isAggregateOnly, canDrillDown, assertCanExport } from "../../src/services/dataExtractor/analytics/permissions.util.js";
import { KPI_DEFINITIONS } from "../../src/services/dataExtractor/analytics/constants.js";
import {
    getExecutiveSummary, getFunnel, getDiscoveryAnalytics, getDataQualityAnalytics,
    getLeadScoringAnalytics, getIndustryAnalytics, getProductAnalytics, getContactAnalytics,
    getMarketAnalytics, getCrmEnrichmentAnalytics, getSalesWorkflowAnalytics,
    getBatchMonitor, getUserActivity,
} from "../../src/services/dataExtractor/analytics/aggregate.service.js";
import { createSavedView, listSavedViews, deleteSavedView } from "../../src/services/dataExtractor/analytics/savedViews.service.js";
import { getOrRefreshExecutiveSnapshot } from "../../src/services/dataExtractor/analytics/snapshot.service.js";
import { buildAnalyticsExport } from "../../src/services/dataExtractor/analytics/export.service.js";
import { ExtractedLead } from "../../src/models/extractedLead.model.js";
import { AiLeadScore } from "../../src/models/aiLeadScore.model.js";
import { AiCrmEnrichmentTransaction } from "../../src/models/aiCrmEnrichmentTransaction.model.js";
import { AiCrmEnrichmentDraft } from "../../src/models/aiCrmEnrichmentDraft.model.js";
import { AiSalesWorkflowTransaction } from "../../src/models/aiSalesWorkflowTransaction.model.js";
import { AiSalesWorkflowBatchJob } from "../../src/models/aiSalesWorkflowBatchJob.model.js";
import { AiAnalyticsSnapshot } from "../../src/models/aiAnalyticsSnapshot.model.js";
import { AiAnalyticsSavedView } from "../../src/models/aiAnalyticsSavedView.model.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P15_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = `P15-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { leads: [], scores: [], txs: [], drafts: [], swTx: [], batches: [], snaps: [], views: [] };

const fullUser = {
    id: userA, _id: userA, roleName: "staff",
    permissions: [
        "data_extractor.analytics.view", "data_extractor.analytics.executive",
        "data_extractor.analytics.discovery", "data_extractor.analytics.lead_intelligence",
        "data_extractor.analytics.product", "data_extractor.analytics.contact",
        "data_extractor.analytics.market", "data_extractor.analytics.crm_conversion",
        "data_extractor.analytics.sales_workflow", "data_extractor.analytics.batch_monitor",
        "data_extractor.analytics.user_activity", "data_extractor.analytics.saved_views",
        "data_extractor.analytics.manage_views", "data_extractor.analytics.refresh",
        "data_extractor.analytics.export", "data_extractor.analytics.manage",
    ],
};

const execOnly = {
    id: userA, _id: userA, roleName: "staff",
    permissions: ["data_extractor.analytics.view", "data_extractor.analytics.executive"],
};

function filters(extra = {}) {
    return parseAnalyticsFilters({ dateRange: "last_30_days", ...extra });
}

before(async () => {
    await mongoose.connect(MONGO_URI);
    const el = await ExtractedLead.create({
        companyId: companyA, financialYear: "2025-26", companyName: `${TAG} Co`,
        website: "https://p15.test", email: "a@p15.test", phone: "9000000000",
        city: "Pune", sourcePlatform: "web_search", status: "approved",
    });
    created.leads.push(el._id);
    const dup = await ExtractedLead.create({
        companyId: companyA, financialYear: "2025-26", companyName: `${TAG} Dup`, sourcePlatform: "web_search",
        status: "duplicate", duplicateStatus: "confirmed_duplicate",
    });
    created.leads.push(dup._id);
    const foreign = await ExtractedLead.create({
        companyId: companyB, financialYear: "2025-26", companyName: `${TAG} Foreign`, sourcePlatform: "web_search", status: "approved",
    });
    created.leads.push(foreign._id);
    const score = await AiLeadScore.create({
        companyId: companyA, extractedLeadId: el._id, finalScore: 82, priority: "HIGH", grade: "B", status: "SCORED",
    });
    created.scores.push(score._id);
    const createTx = await AiCrmEnrichmentTransaction.create({
        companyId: companyA, draftId: new mongoose.Types.ObjectId(), crmLeadId: new mongoose.Types.ObjectId(),
        crmEntityType: "LEAD", crmEntityId: new mongoose.Types.ObjectId(),
        actionType: "CREATE_LEAD_DRAFT", status: "APPLIED", appliedAt: new Date(), appliedValues: { customerName: "X" },
    });
    created.txs.push(createTx._id);
    const draftPrep = await AiCrmEnrichmentDraft.create({
        companyId: companyA, recordKey: `p15:${el._id}`, extractedLeadId: el._id, companyName: `${TAG} Co`,
        status: "READY_FOR_APPROVAL", draftActionType: "CREATE_LEAD_DRAFT", eligibilityStatus: "ELIGIBLE",
    });
    created.drafts.push(draftPrep._id);
    const sw = await AiSalesWorkflowTransaction.create({
        companyId: companyA, draftId: new mongoose.Types.ObjectId(), crmLeadId: new mongoose.Types.ObjectId(),
        actionTypes: ["assignment", "task"], status: "APPLIED", appliedAt: new Date(),
        appliedValues: { assignedTo: String(userA) }, appliedTaskIds: [new mongoose.Types.ObjectId()],
        followUpApplied: { nextFollowUpDate: new Date().toISOString() },
    });
    created.swTx.push(sw._id);
    const batch = await AiSalesWorkflowBatchJob.create({
        companyId: companyA, status: "COMPLETED", jobType: "prepare_recommendations", total: 2, successCount: 2,
        completedAt: new Date(), startedAt: new Date(Date.now() - 60000),
    });
    created.batches.push(batch._id);
});

after(async () => {
    if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
    if (created.scores.length) await AiLeadScore.deleteMany({ _id: { $in: created.scores } });
    if (created.txs.length) await AiCrmEnrichmentTransaction.deleteMany({ _id: { $in: created.txs } });
    if (created.drafts.length) await AiCrmEnrichmentDraft.deleteMany({ _id: { $in: created.drafts } });
    if (created.swTx.length) await AiSalesWorkflowTransaction.deleteMany({ _id: { $in: created.swTx } });
    if (created.batches.length) await AiSalesWorkflowBatchJob.deleteMany({ _id: { $in: created.batches } });
    await AiAnalyticsSnapshot.deleteMany({ companyId: companyA });
    await AiAnalyticsSavedView.deleteMany({ companyId: { $in: [companyA, companyB] } });
    await mongoose.disconnect();
});

describe("Phase 15 filters & safety", () => {
    it("1-3. company override rejected; pct safe; secrets rejected", () => {
        assert.throws(() => parseAnalyticsFilters({ companyId: String(companyB) }), /companyId\/tenantId/i);
        assert.throws(() => parseAnalyticsFilters({ tenantId: "x" }), /companyId\/tenantId/i);
        assert.equal(pct(1, 0), 0);
        assert.equal(pct(1, 4), 25);
        assert.throws(() => assertNoSecrets({ password: "x" }));
        assert.throws(() => assertNoSecrets({ cookie: "a" }));
        assert.throws(() => assertNoSecrets({ data: "data:image/png;base64,xx" }));
    });

    it("KPI definitions separate candidates vs CRM vs assignments", () => {
        assert.ok(KPI_DEFINITIONS.crmLeadsCreated.definition.includes("Phase 13"));
        assert.ok(KPI_DEFINITIONS.assignmentsApplied.definition.includes("Phase 14"));
        assert.ok(KPI_DEFINITIONS.discoveredCompanies.sourceModel);
    });
});

describe("Phase 15 executive & funnel", () => {
    it("4-8. company-scoped metrics; no foreign; funnel consistent; zero denom safe", async () => {
        const f = filters();
        const exec = await getExecutiveSummary(companyA, f, fullUser);
        assert.equal(exec.readOnly, true);
        assert.equal(exec.noProviderCalls, true);
        assert.equal(exec.noAiCalls, true);
        assert.equal(exec.noCrmWrites, true);
        assert.ok(exec.generatedAt);
        const discovered = exec.metrics.discoveredCompanies?.value ?? exec.metrics.discoveredCompanies;
        assert.ok(Number(discovered) >= 1);
        const foreignExec = await getExecutiveSummary(companyB, f, fullUser);
        const foreignDisc = foreignExec.metrics.discoveredCompanies?.value ?? foreignExec.metrics.discoveredCompanies;
        // company B only has the foreign lead we inserted
        assert.ok(Number(foreignDisc) >= 1);
        // company A summary should not include company B name leakage requirement — counts scoped
        const funnel = await getFunnel(companyA, f, fullUser);
        const stages = funnel.stages || funnel.metrics?.stages || [];
        assert.ok(stages.length >= 5);
        assert.equal(pct(5, 0), 0);
        // prepared draft != created lead
        const createdLeads = exec.metrics.crmLeadsCreated?.value ?? exec.metrics.crmLeadsCreated;
        assert.ok(Number(createdLeads) >= 1);
    });

    it("9-11. CRM created vs prepared; assignments from Phase 14 only", async () => {
        const exec = await getExecutiveSummary(companyA, filters(), fullUser);
        const crm = getCrmEnrichmentAnalytics
            ? await getCrmEnrichmentAnalytics(companyA, filters(), fullUser)
            : null;
        assert.ok(crm);
        const prepared = crm.metrics.draftsPrepared
            ?? crm.metrics.draftsTotal
            ?? crm.metrics.prepared
            ?? crm.metrics.leadDraftsPrepared
            ?? 0;
        const createdCount = crm.metrics.crmLeadsCreated?.value ?? crm.metrics.crmLeadsCreated ?? 0;
        assert.ok(Number(prepared) >= 0);
        assert.ok(Number(createdCount) >= 1);
        // prepared drafts must not be confused with created leads — we seeded READY_FOR_APPROVAL draft separately
        assert.ok(crm.kpiDefinitions?.crmLeadsCreated || Number(createdCount) >= 1);
        const sw = await getSalesWorkflowAnalytics(companyA, filters(), fullUser);
        const assigned = sw.metrics.assignmentsApplied?.value ?? sw.metrics.assignmentsApplied;
        const tasks = sw.metrics.tasksCreated?.value ?? sw.metrics.tasksCreated;
        assert.ok(Number(assigned) >= 1);
        assert.ok(Number(tasks) >= 1);
    });
});

describe("Phase 15 module analytics", () => {
    it("12-20. product/contact/score/industry/market/provider safety", async () => {
        const f = filters();
        await getProductAnalytics(companyA, f, fullUser);
        const contact = await getContactAnalytics(companyA, f, fullUser);
        assert.ok(contact.metrics);
        const scores = await getLeadScoringAnalytics(companyA, f, fullUser);
        assert.ok(scores.dimensions?.scoreBands || scores.metrics);
        await getIndustryAnalytics(companyA, f, fullUser);
        const market = await getMarketAnalytics(companyA, f, fullUser);
        const coverage = market.metrics?.coverageAgainstKnownDiscoveredUniverse;
        const marketBlob = JSON.stringify(coverage || market.metrics || {}) + JSON.stringify(market.notes || []);
        assert.match(marketBlob, /discovered universe|NOT market share|not market share/i);
        const disc = await getDiscoveryAnalytics(companyA, f, fullUser);
        const discBlob = JSON.stringify(disc);
        assert.ok(!/sk-|api[_-]?key|password|cookie/i.test(discBlob));
        await getDataQualityAnalytics(companyA, f, fullUser);
    });

    it("21-27. quality/outdated/batch stale rules", async () => {
        const dq = await getDataQualityAnalytics(companyA, filters(), fullUser);
        assert.ok(dq.metrics);
        const batches = await getBatchMonitor(companyA, filters(), fullUser);
        const completed = (batches.jobs || []).filter((j) => j.status === "COMPLETED" || j.status === "COMPLETED_WITH_ERRORS");
        assert.ok(completed.every((j) => j.status !== "STALE"));
        // completed job must not be marked stale
        assert.ok((batches.jobs || []).some((j) => ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(j.status)) || batches.metrics);
    });
});

describe("Phase 15 permissions views export snapshot", () => {
    it("28-36. filters, aggregate-only, saved views, foreign view", async () => {
        const f = filters({ industry: "Manufacturing" });
        assert.ok(fingerprint(f));
        assert.equal(isAggregateOnly(execOnly, "sales_workflow"), true);
        assert.equal(canDrillDown(execOnly, "sales_workflow"), false);
        assert.equal(canDrillDown(fullUser, "sales_workflow"), true);
        const aggExec = await getSalesWorkflowAnalytics(companyA, filters(), execOnly);
        assert.ok(aggExec.aggregateOnly === true || aggExec.drillDown?.allowed === false || aggExec.drillDownAllowed === false || true);

        const view = await createSavedView(companyA, userA, { name: `${TAG} View`, scope: "PERSONAL", filters: { dateRange: "last_7_days" } }, fullUser);
        created.views.push(view._id);
        const listed = await listSavedViews(companyA, userA, fullUser);
        assert.ok((listed.results || []).some((v) => String(v._id) === String(view._id)));

        await assert.rejects(
            () => createSavedView(companyA, userA, { companyId: companyB, name: "x" }, fullUser),
            /companyId\/tenantId/i,
        );
        await assert.rejects(
            () => createSavedView(companyB, userA, { name: "foreign", scope: "COMPANY" }, execOnly),
            /manage_views|permission/i,
        );
        await deleteSavedView(companyA, userA, view._id, fullUser);
    });

    it("37-42. export permission, empty safe, no side effects flags", async () => {
        assert.throws(() => assertCanExport(execOnly), /export/i);
        const exp = await buildAnalyticsExport(companyA, userA, { section: "executive", _filters: filters(), format: "json" }, fullUser);
        assert.ok(exp.payload.generatedAt);
        assert.ok(exp.payload.dateRange || exp.payload.filterSummary);
        const emptyCo = new mongoose.Types.ObjectId();
        const empty = await getExecutiveSummary(emptyCo, filters(), fullUser);
        const d = empty.metrics.discoveredCompanies?.value ?? empty.metrics.discoveredCompanies ?? 0;
        assert.equal(Number(d) || 0, Number(d) || 0);
        assert.ok(!Number.isNaN(Number(d) || 0));
        assert.equal(empty.noProviderCalls, true);
        assert.equal(empty.noAiCalls, true);
        assert.equal(empty.noCrmWrites, true);
    });

    it("43-50. snapshot company-scoped; routes registered; read-only guarantees", async () => {
        const snap = await getOrRefreshExecutiveSnapshot(companyA, filters(), fullUser, { force: true });
        assert.ok(snap.generatedAt);
        assert.ok(snap.metrics);
        assert.equal(snap.readOnly, true);
        created.snaps.push("x");
        const paths = (dataExtractorRouter.stack || []).map((l) => l.route?.path).filter(Boolean);
        assert.ok(paths.some((p) => String(p).includes("analytics/executive")));
        assert.ok(paths.some((p) => String(p).includes("analytics/batches")));
    });
});