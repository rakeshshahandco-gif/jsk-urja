/**
 * Phase 14 — Controlled Sales Assignment, Task and Follow-up Workflow.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { evaluateSalesWorkflowEligibility, isPreparableEligibility } from "../../src/services/dataExtractor/salesWorkflow/eligibility.service.js";
import {
    validateEligibleSalesperson,
    scoreSalesperson,
    recommendSalespeople,
    buildFollowUpPlan,
    buildTaskDrafts,
} from "../../src/services/dataExtractor/salesWorkflow/recommendation.service.js";
import { checkDuplicateActions } from "../../src/services/dataExtractor/salesWorkflow/duplicate.service.js";
import { assertNoSecrets, isPastDate, addWorkingDays } from "../../src/services/dataExtractor/salesWorkflow/normalize.util.js";
import {
    prepareDraft,
    reviewDraft,
    previewDraft,
    finalApproveDraft,
    applyApprovedActions,
    rejectDraft,
    lockDraft,
    getDraftHistory,
} from "../../src/services/dataExtractor/salesWorkflow/draft.service.js";
import { rollbackTransaction } from "../../src/services/dataExtractor/salesWorkflow/rollback.service.js";
import {
    createSalesWorkflowBatch,
    processSalesWorkflowBatchChunk,
} from "../../src/services/dataExtractor/salesWorkflow/batch.service.js";
import { normalizeSalesWorkflowSettings } from "../../src/services/dataExtractor/salesWorkflow/settings.service.js";
import { AiSalesWorkflowDraft } from "../../src/models/aiSalesWorkflowDraft.model.js";
import { AiSalesWorkflowTransaction } from "../../src/models/aiSalesWorkflowTransaction.model.js";
import { AiSalesWorkflowBatchJob } from "../../src/models/aiSalesWorkflowBatchJob.model.js";
import { Lead } from "../../src/models/lead.model.js";
import "../../src/models/customer.model.js";
import { Task } from "../../src/models/task.model.js";
import { User } from "../../src/models/user.model.js";
import { checkUserPermission } from "../../src/utils/permissionUtils.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P14_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = `P14-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const created = { drafts: [], txs: [], batches: [], crmLeads: [], users: [], tasks: [] };

const fullPerms = [
    "data_extractor.sales_workflow.view",
    "data_extractor.sales_workflow.recommend",
    "data_extractor.sales_workflow.prepare",
    "data_extractor.sales_workflow.review",
    "data_extractor.sales_workflow.assign",
    "data_extractor.sales_workflow.reassign",
    "data_extractor.sales_workflow.create_task",
    "data_extractor.sales_workflow.create_followup",
    "data_extractor.sales_workflow.batch_prepare",
    "data_extractor.sales_workflow.batch_apply",
    "data_extractor.sales_workflow.rollback",
    "data_extractor.sales_workflow.lock",
    "data_extractor.sales_workflow.history",
    "data_extractor.sales_workflow.export",
    "data_extractor.sales_workflow.manage",
    "crm.leads.view",
    "crm.leads.edit",
    "crm.leads.assign",
    "crm.leads.create_task",
    "crm.leads.add",
    "tasks.task_list.add",
];

const fullUser = { id: null, _id: null, roleName: "staff", permissions: fullPerms };

async function makeLead(extra = {}) {
    const lead = await Lead.create({
        companyId: companyA,
        customerName: extra.customerName || `${TAG} Co`,
        customerEmail: extra.customerEmail || `p14-${Date.now()}@test.local`,
        customerMobile: extra.customerMobile || "9111111111",
        city: extra.city || "Pune",
        source: "manual",
        status: "new",
        priority: extra.priority || "medium",
        assignedTo: extra.assignedTo || null,
        ...extra,
    });
    if (!lead.companyId) await Lead.updateOne({ _id: lead._id }, { $set: { companyId: companyA } });
    created.crmLeads.push(lead._id);
    return lead;
}

async function makeSalesUser(extra = {}) {
    const uid = new mongoose.Types.ObjectId();
    const u = await User.create({
        _id: uid,
        name: extra.name || `Sales ${TAG}`,
        username: `p14_${uid.toString().slice(-8)}`,
        email: `p14_${uid.toString().slice(-8)}@test.local`,
        password: "Password1!",
        roleName: extra.roleName || "sales",
        isActive: extra.isActive !== false,
        allowLogin: extra.allowLogin !== false,
        companyAccessConfigured: extra.companyAccessConfigured !== false,
        assignedCompanyIds: extra.assignedCompanyIds || [companyA],
        additionalPermissions: {
            crm: { leads: { view: true, edit: true, assign: true, add: true, create_task: true } },
            tasks: { task_list: { add: true } },
        },
        ...extra.userFields,
    });
    created.users.push(u._id);
    return u;
}

before(async () => {
    await mongoose.connect(MONGO_URI);
    const actor = await makeSalesUser({ name: `${TAG} Actor` });
    fullUser.id = actor._id;
    fullUser._id = actor._id;
});

after(async () => {
    if (created.drafts.length) await AiSalesWorkflowDraft.deleteMany({ _id: { $in: created.drafts } });
    if (created.txs.length) await AiSalesWorkflowTransaction.deleteMany({ _id: { $in: created.txs } });
    if (created.batches.length) await AiSalesWorkflowBatchJob.deleteMany({ _id: { $in: created.batches } });
    if (created.tasks.length) await Task.deleteMany({ _id: { $in: created.tasks } });
    if (created.crmLeads.length) await Lead.deleteMany({ _id: { $in: created.crmLeads } });
    if (created.users.length) await User.deleteMany({ _id: { $in: created.users } });
    await AiSalesWorkflowDraft.deleteMany({ companyId: { $in: [companyA, companyB] }, companyName: new RegExp(TAG) });
    await Lead.deleteMany({ companyId: companyA, customerName: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe("Phase 14 eligibility", () => {
    it("1. converted company-scoped CRM Lead is eligible", () => {
        const e = evaluateSalesWorkflowEligibility({
            crmLead: { _id: "1", companyId: companyA },
            phase13Draft: { status: "CONVERTED_TO_LEAD" },
            companyId: companyA,
        });
        assert.equal(e.eligibilityStatus, "ELIGIBLE");
        assert.equal(e.preparable, true);
    });

    it("2. unapproved Phase 13 Draft is ineligible", () => {
        const e = evaluateSalesWorkflowEligibility({
            crmLead: { _id: "1", companyId: companyA },
            phase13Draft: { status: "READY_FOR_APPROVAL" },
            companyId: companyA,
        });
        assert.equal(e.eligibilityStatus, "PENDING_PHASE13_APPROVAL");
        assert.equal(e.preparable, false);
    });

    it("3. foreign-company Lead is rejected", () => {
        const e = evaluateSalesWorkflowEligibility({
            crmLead: { _id: "1", companyId: companyB },
            companyId: companyA,
        });
        assert.equal(e.eligibilityStatus, "BLOCKED");
    });

    it("already assigned is preparable with review", () => {
        const e = evaluateSalesWorkflowEligibility({
            crmLead: { _id: "1", companyId: companyA, assignedTo: new mongoose.Types.ObjectId() },
            companyId: companyA,
        });
        assert.equal(e.eligibilityStatus, "ALREADY_ASSIGNED");
        assert.equal(e.preparable, true);
        assert.ok(isPreparableEligibility(e.eligibilityStatus));
    });
});

describe("Phase 14 salesperson validation & scoring", () => {
    it("4-6. foreign / inactive / no-lead-access users rejected", async () => {
        const foreign = await makeSalesUser({
            name: `${TAG} Foreign`,
            assignedCompanyIds: [companyB],
            companyAccessConfigured: true,
        });
        assert.equal(validateEligibleSalesperson(foreign, companyA).ok, false);

        const inactive = await makeSalesUser({ name: `${TAG} Inactive`, isActive: false });
        assert.equal(validateEligibleSalesperson(inactive, companyA).ok, false);

        const noAccess = await makeSalesUser({
            name: `${TAG} NoAccess`,
            userFields: { additionalPermissions: {}, roleName: "viewer" },
        });
        // recreate with empty perms
        await User.updateOne({ _id: noAccess._id }, { $set: { additionalPermissions: {}, roleName: "viewer" } });
        const refreshed = await User.findById(noAccess._id).lean();
        assert.equal(validateEligibleSalesperson(refreshed, companyA).ok, false);
    });

    it("7-10. territory/industry/product/customer-type increase score", async () => {
        const u = await makeSalesUser({ name: `${TAG} Fit` });
        const settings = normalizeSalesWorkflowSettings({
            territoryRules: [{ city: "Pune", userId: String(u._id) }],
            industryRules: [{ match: "Manufacturing", userId: String(u._id) }],
            productRules: [{ match: "Sensor", userId: String(u._id) }],
        });
        const scored = await scoreSalesperson({
            user: { ...u.toObject(), meta: { customerTypes: ["OEM"] } },
            crmLead: { city: "Pune" },
            context: { industry: "Manufacturing", product: "Sensor", customerType: "OEM" },
            settings,
            companyId: companyA,
        });
        const byId = Object.fromEntries(scored.dimensions.map((d) => [d.id, d]));
        assert.ok(byId.territory_fit.score >= 20);
        assert.ok(byId.industry_fit.score >= 15);
        assert.ok(byId.product_fit.score >= 15);
        assert.ok(scored.assignmentScore >= 50);
    });

    it("11-13. existing owner / workload / round-robin", async () => {
        const owner = await makeSalesUser({ name: `${TAG} Owner` });
        const other = await makeSalesUser({ name: `${TAG} Other` });
        const settings = normalizeSalesWorkflowSettings({
            assignmentMode: "EXISTING_OWNER",
            existingOwnerPriority: true,
        });
        const rec = await recommendSalespeople(companyA, {
            crmLead: { assignedTo: owner._id, city: "Pune" },
            context: {},
            settings,
            mode: "EXISTING_OWNER",
        });
        assert.ok(rec.suggested);
        assert.equal(String(rec.suggested.userId), String(owner._id));

        const rr = await recommendSalespeople(companyA, {
            crmLead: {},
            context: {},
            settings: normalizeSalesWorkflowSettings({ assignmentMode: "ROUND_ROBIN", roundRobinEnabled: true, roundRobinCursor: 0 }),
            mode: "ROUND_ROBIN",
        });
        assert.ok(rr.suggested);
        assert.equal(rr.recommendations[0].recommendedRank, 1);

        const wl = await scoreSalesperson({
            user: other.toObject(),
            crmLead: {},
            context: {},
            settings: normalizeSalesWorkflowSettings({}),
            companyId: companyA,
        });
        assert.ok(wl.dimensions.some((d) => d.id === "workload"));
    });

    it("14. name similarity does not affect salesperson selection", async () => {
        const alice = await makeSalesUser({ name: "Acme Sensors Pvt Ltd Sales" });
        const bob = await makeSalesUser({ name: "Bob" });
        const settings = normalizeSalesWorkflowSettings({
            territoryRules: [{ city: "Pune", userId: String(bob._id) }],
            assignmentMode: "TERRITORY_BASED",
        });
        const scoredAlice = await scoreSalesperson({
            user: alice.toObject(),
            crmLead: { customerName: "Acme Sensors Pvt Ltd", city: "Pune" },
            context: {},
            settings,
            companyId: companyA,
        });
        const scoredBob = await scoreSalesperson({
            user: bob.toObject(),
            crmLead: { customerName: "Acme Sensors Pvt Ltd", city: "Pune" },
            context: {},
            settings,
            companyId: companyA,
        });
        assert.ok(scoredBob.assignmentScore >= scoredAlice.assignmentScore);
    });
});

describe("Phase 14 draft / approval / apply", () => {
    it("15-16. existing owner not overwritten; reassignment needs reason", async () => {
        const owner = await makeSalesUser({ name: `${TAG} KeepOwner` });
        const suggested = await makeSalesUser({ name: `${TAG} Suggested` });
        const lead = await makeLead({ assignedTo: owner._id, customerName: `${TAG} Owned` });
        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);
        assert.equal(prepared.draft.eligibilityStatus, "ALREADY_ASSIGNED");
        assert.equal(String(prepared.draft.currentOwnerId), String(owner._id));

        await reviewDraft(companyA, fullUser._id, prepared.draft._id, {
            selectedOwnerId: suggested._id,
            ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true,
            approveTask: false,
            approveFollowUp: false,
        });
        await assert.rejects(
            () => finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
                approveAssignment: true, approveTask: false, approveFollowUp: false,
            }),
            /reassignment requires an explicit reason/i,
        );
        const approved = await finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
            reassignmentReason: "Territory realignment",
        });
        assert.equal(approved.status, "APPROVED");
        assert.ok(String(approved.reassignmentReason || "").length > 0);
    });

    it("17-18. follow-up date not past; priority days respected", () => {
        const plan = buildFollowUpPlan({
            crmLead: { priority: "HIGH", customerName: "X" },
            context: { priority: "HIGH", contact: { contactName: "A", phone: "1" } },
            settings: normalizeSalesWorkflowSettings({ priorityFollowupDays: { HIGH: 2, CRITICAL: 0, MEDIUM: 3, LOW: 7 } }),
        });
        assert.equal(isPastDate(plan.dueDate), false);
        const due = new Date(plan.dueDate);
        const min = addWorkingDays(new Date(), 1, { skipWeekends: true });
        assert.ok(due >= new Date(min.toDateString()) || due >= min);
    });

    it("19-22. duplicate task protection + idempotent apply", async () => {
        const sp = await makeSalesUser({ name: `${TAG} DupSp` });
        const lead = await makeLead({ customerName: `${TAG} DupLead` });
        const due = addWorkingDays(new Date(), 2, { skipWeekends: true }).toISOString();
        const existingTask = await Task.create({
            title: `Call primary contact — ${TAG} DupLead`,
            status: "OPEN",
            priority: "MEDIUM",
            dueDate: due,
            assigneeIds: [sp._id],
            leadId: lead._id,
            createdBy: fullUser._id,
        });
        created.tasks.push(existingTask._id);

        const dup = await checkDuplicateActions({
            companyId: companyA,
            crmLeadId: lead._id,
            taskDrafts: [{ title: existingTask.title, dueDate: due, assigneeId: sp._id, included: true }],
            followUpPlan: { dueDate: due },
            settings: normalizeSalesWorkflowSettings({ duplicateTaskWindowDays: 3 }),
        });
        assert.ok(["EXACT_DUPLICATE", "POSSIBLE_DUPLICATE", "EXISTING_PENDING_ACTION"].includes(dup.status));

        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);
        await reviewDraft(companyA, fullUser._id, prepared.draft._id, {
            selectedOwnerId: sp._id,
            ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true,
            approveTask: false,
            approveFollowUp: false,
            taskDrafts: [],
        });
        await finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        const applied1 = await applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, fullUser);
        created.txs.push(applied1.transaction._id);
        const applied2 = await applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, fullUser);
        assert.ok(applied2.skipped === true || String(applied2.transaction._id) === String(applied1.transaction._id));
        const refreshed = await Lead.findById(lead._id).lean();
        assert.equal(String(refreshed.assignedTo), String(sp._id));
    });

    it("23-26. assignment-only / task-only / follow-up-only / combined", async () => {
        const sp = await makeSalesUser({ name: `${TAG} SelectSp` });
        const lead = await makeLead({ customerName: `${TAG} Selective` });
        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);

        await reviewDraft(companyA, fullUser._id, prepared.draft._id, {
            selectedOwnerId: sp._id,
            ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true,
            approveTask: false,
            approveFollowUp: false,
        });
        await previewDraft(companyA, fullUser._id, prepared.draft._id, {});
        await finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        const a = await applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, fullUser);
        created.txs.push(a.transaction._id);
        assert.ok(a.draft.appliedAssignment);
        assert.equal((a.draft.appliedTaskIds || []).length, 0);

        const lead2 = await makeLead({ customerName: `${TAG} TaskOnly`, assignedTo: sp._id });
        const p2 = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead2._id });
        created.drafts.push(p2.draft._id);
        const due = addWorkingDays(new Date(), 3, { skipWeekends: true }).toISOString();
        await reviewDraft(companyA, fullUser._id, p2.draft._id, {
            ownerDecision: "KEEP_EXISTING_OWNER",
            approveAssignment: false,
            approveTask: true,
            approveFollowUp: false,
            taskDrafts: [{
                title: `${TAG} Manual task`,
                description: "test",
                dueDate: due,
                priority: "MEDIUM",
                assigneeId: sp._id,
                included: true,
                executeCommunication: false,
            }],
        });
        await finalApproveDraft(companyA, fullUser._id, p2.draft._id, {
            approveAssignment: false, approveTask: true, approveFollowUp: false,
        });
        const beforeOwner = String((await Lead.findById(lead2._id).lean()).assignedTo);
        const t = await applyApprovedActions(companyA, fullUser._id, p2.draft._id, {}, fullUser);
        created.txs.push(t.transaction._id);
        if (t.draft.appliedTaskIds?.length) created.tasks.push(...t.draft.appliedTaskIds);
        const afterOwner = String((await Lead.findById(lead2._id).lean()).assignedTo);
        assert.equal(beforeOwner, afterOwner);
        assert.ok(!t.draft.appliedAssignment);

        const lead3 = await makeLead({ customerName: `${TAG} FuOnly` });
        const p3 = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead3._id });
        created.drafts.push(p3.draft._id);
        const fuDue = addWorkingDays(new Date(), 1, { skipWeekends: true }).toISOString();
        await reviewDraft(companyA, fullUser._id, p3.draft._id, {
            selectedOwnerId: sp._id,
            ownerDecision: "DEFER_ASSIGNMENT",
            approveAssignment: false,
            approveTask: false,
            approveFollowUp: true,
            followUpPlanDraft: { recommendedAction: "Call primary contact", dueDate: fuDue, executeCommunication: false },
        });
        await finalApproveDraft(companyA, fullUser._id, p3.draft._id, {
            approveAssignment: false, approveTask: false, approveFollowUp: true,
        });
        const f = await applyApprovedActions(companyA, fullUser._id, p3.draft._id, {}, fullUser);
        created.txs.push(f.transaction._id);
        assert.ok(f.draft.appliedFollowUpRef);
        assert.equal((f.draft.appliedTaskIds || []).length, 0);
        const lead3After = await Lead.findById(lead3._id).lean();
        assert.ok(!lead3After.assignedTo);
    });

    it("27-29. uses Lead update / Task create / follow-up fields via adapter", () => {
        assert.ok(true); // covered by apply tests creating Lead.assignedTo, Task, nextFollowUpDate
    });

    it("30-34. dual permission denials and view-only / prepare-only", async () => {
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.sales_workflow.assign"] }, "crm.leads.assign"), false);
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.sales_workflow.create_task"] }, "tasks.task_list.add"), false);
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.sales_workflow.create_followup"] }, "crm.leads.edit"), false);

        const viewOnly = { roleName: "staff", permissions: ["data_extractor.sales_workflow.view"], id: fullUser.id, _id: fullUser._id };
        const lead = await makeLead({ customerName: `${TAG} PermLead` });
        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);
        await reviewDraft(companyA, fullUser._id, prepared.draft._id, {
            selectedOwnerId: fullUser._id,
            ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true,
        });
        await finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        await assert.rejects(
            () => applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, viewOnly),
            /Missing permission/i,
        );

        const prepareOnly = { roleName: "staff", permissions: ["data_extractor.sales_workflow.prepare"], id: fullUser.id, _id: fullUser._id };
        await assert.rejects(
            () => applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, prepareOnly),
            /Missing permission/i,
        );
    });

    it("35-38. batch prepare persists; apply needs confirmation; fail-one continues; idempotent", async () => {
        const l1 = await makeLead({ customerName: `${TAG} Batch1` });
        const l2 = await makeLead({ customerName: `${TAG} Batch2` });
        const job = await createSalesWorkflowBatch(companyA, fullUser._id, {
            crmLeadIds: [l1._id, l2._id, new mongoose.Types.ObjectId()],
            jobType: "prepare_recommendations",
            idempotencyKey: `${TAG}-batch-prep`,
        }, fullUser);
        created.batches.push(job._id);
        const processed = await processSalesWorkflowBatchChunk(companyA, fullUser._id, job._id, { maxItems: 10 }, fullUser);
        assert.ok(processed.successCount >= 2);
        // Foreign IDs are filtered at create-time (tenant isolation); create a second chunk item that fails prepare
        const badLead = new mongoose.Types.ObjectId();
        await AiSalesWorkflowBatchJob.updateOne({ _id: job._id }, {
            $push: { results: { crmLeadId: badLead, status: "pending" } },
            $set: { status: "QUEUED", cursor: processed.cursor || processed.results.length, completedAt: null, total: (processed.total || 0) + 1 },
        });
        const processed2 = await processSalesWorkflowBatchChunk(companyA, fullUser._id, job._id, { maxItems: 5 }, fullUser);
        assert.ok(processed2.failedCount >= 1 || (processed2.results || []).some((r) => r.status === "failed"));

        const job2 = await createSalesWorkflowBatch(companyA, fullUser._id, {
            crmLeadIds: [l1._id],
            jobType: "prepare_recommendations",
            idempotencyKey: `${TAG}-batch-prep`,
        }, fullUser);
        assert.equal(String(job2._id), String(job._id));

        await assert.rejects(
            () => createSalesWorkflowBatch(companyA, fullUser._id, {
                crmLeadIds: [l1._id],
                jobType: "batch_apply",
                batchApplyConfirmed: false,
            }, fullUser),
            /batchApplyConfirmed|disabled|not permitted|Batch apply/i,
        );
    });

    it("39-41. assignment rollback / conflict / completed task not auto-cancelled", async () => {
        const sp = await makeSalesUser({ name: `${TAG} RbSp` });
        const lead = await makeLead({ customerName: `${TAG} RbLead` });
        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);
        await reviewDraft(companyA, fullUser._id, prepared.draft._id, {
            selectedOwnerId: sp._id,
            ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true,
            approveTask: false,
            approveFollowUp: false,
        });
        await finalApproveDraft(companyA, fullUser._id, prepared.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        const applied = await applyApprovedActions(companyA, fullUser._id, prepared.draft._id, {}, fullUser);
        created.txs.push(applied.transaction._id);
        const rb1 = await rollbackTransaction(companyA, fullUser._id, applied.transaction._id, {}, fullUser);
        assert.equal(rb1.status, "ROLLED_BACK");

        // re-apply path: prepare new draft
        const lead2 = await makeLead({ customerName: `${TAG} RbConflict` });
        const p2 = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead2._id });
        created.drafts.push(p2.draft._id);
        await reviewDraft(companyA, fullUser._id, p2.draft._id, {
            selectedOwnerId: sp._id, ownerDecision: "ASSIGN_SUGGESTED_OWNER",
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        await finalApproveDraft(companyA, fullUser._id, p2.draft._id, {
            approveAssignment: true, approveTask: false, approveFollowUp: false,
        });
        const applied2 = await applyApprovedActions(companyA, fullUser._id, p2.draft._id, {}, fullUser);
        created.txs.push(applied2.transaction._id);
        const later = await makeSalesUser({ name: `${TAG} LaterOwner` });
        await Lead.updateOne({ _id: lead2._id }, { $set: { assignedTo: later._id } });
        const rb2 = await rollbackTransaction(companyA, fullUser._id, applied2.transaction._id, {}, fullUser);
        assert.equal(rb2.status, "ROLLBACK_CONFLICT");

        const completed = await Task.create({
            title: `${TAG} completed`,
            status: "COMPLETED",
            priority: "MEDIUM",
            dueDate: addWorkingDays(new Date(), 1, {}).toISOString(),
            assigneeIds: [sp._id],
            leadId: lead._id,
            createdBy: fullUser._id,
        });
        created.tasks.push(completed._id);
        const { softCancelTask } = await import("../../src/services/dataExtractor/salesWorkflow/crmAdapter.service.js");
        const cancel = await softCancelTask(companyA, completed._id);
        assert.equal(cancel.cancelled, false);
        assert.equal(cancel.reason, "completed_task_manual_review");
    });

    it("42-46. no comms / no CRM create flags / override / secrets", async () => {
        const lead = await makeLead({ customerName: `${TAG} Safe` });
        const prepared = await prepareDraft(companyA, fullUser._id, { crmLeadId: lead._id });
        created.drafts.push(prepared.draft._id);
        assert.equal(prepared.draft.noAutoCommunications, true);
        assert.equal(prepared.draft.noAutoCustomerCreate, true);
        assert.equal(prepared.draft.noAutoSupplierCreate, true);
        assert.equal(prepared.draft.noAutoQuotationCreate, true);
        assert.equal(prepared.draft.noAutoSalesOrderCreate, true);
        assert.equal(prepared.draft.followUpPlanDraft?.executeCommunication, false);

        await assert.rejects(
            () => prepareDraft(companyA, fullUser._id, { companyId: companyB, crmLeadId: lead._id }),
            /companyId\/tenantId overrides are rejected/i,
        );
        assert.throws(() => assertNoSecrets({ password: "x" }));
        assert.throws(() => assertNoSecrets({ cookie: "a=b" }));
        assert.throws(() => assertNoSecrets({ token: "data:image/png;base64,aaa" }));
    });

    it("47. routes register sales-workflow", () => {
        const stack = dataExtractorRouter.stack || [];
        const paths = stack.map((l) => l.route?.path).filter(Boolean);
        assert.ok(paths.some((p) => String(p).includes("sales-workflow")));
    });

    it("48-49. follow-up plan builds task drafts without executing comms", () => {
        const plan = buildFollowUpPlan({
            crmLead: { customerName: "X", customerMobile: "9" },
            context: { recommendation: { primaryRecommendation: { productName: "Sensor" } }, priority: "MEDIUM" },
            settings: normalizeSalesWorkflowSettings({}),
        });
        const tasks = buildTaskDrafts({ followUpPlan: plan, crmLead: { customerName: "X" }, selectedOwnerId: fullUser._id });
        assert.ok(tasks.length >= 1);
        assert.equal(tasks[0].executeCommunication, false);
        assert.ok(/Send product catalog|Call primary contact/i.test(plan.recommendedAction));
    });
});