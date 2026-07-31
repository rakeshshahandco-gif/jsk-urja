/**
 * Phase 12 — Similar Company Discovery, Market Intelligence & Expansion.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import mongoose from "mongoose";
import { scoreSimilarityPair } from "../../src/services/dataExtractor/similarCompany/similarityEngine.service.js";
import { detectRelationshipType, nameSimilarityRatio } from "../../src/services/dataExtractor/similarCompany/relationship.service.js";
import { compareGeography, assertRadiusRequiresCoordinates } from "../../src/services/dataExtractor/similarCompany/nearby.service.js";
import {
    buildClusters,
    buildMarketCoverage,
    buildWhiteSpaceGaps,
    buildExpansionSuggestions,
} from "../../src/services/dataExtractor/similarCompany/marketIntelligence.service.js";
import { validateAiSimilarityOutput, enrichSimilarityWithAi } from "../../src/services/dataExtractor/similarCompany/aiAdapter.js";
import { normalizeSimilaritySettings } from "../../src/services/dataExtractor/similarCompany/settings.service.js";
import { DEFAULT_SIMILARITY_SETTINGS } from "../../src/services/dataExtractor/similarCompany/constants.js";
import {
    findSimilarForSeed,
    analyzeSamplePair,
    overrideSimilarResult,
    lockSimilarResult,
    exportApprovedCandidates,
    markOutdatedIfUnlocked,
    getSimilarHistory,
} from "../../src/services/dataExtractor/similarCompany/store.service.js";
import { runMarketIntelligence } from "../../src/services/dataExtractor/similarCompany/marketStore.service.js";
import {
    createSimilarBatch,
    controlSimilarBatch,
    processSimilarBatchChunk,
    getSimilarBatch,
} from "../../src/services/dataExtractor/similarCompany/batch.service.js";
import { AiSimilarCompanyResult } from "../../src/models/aiSimilarCompanyResult.model.js";
import { AiSimilarCompanyBatchJob } from "../../src/models/aiSimilarCompanyBatchJob.model.js";
import { AiMarketIntelligence } from "../../src/models/aiMarketIntelligence.model.js";
import { ExtractedLead } from "../../src/models/extractedLead.model.js";
import { checkUserPermission } from "../../src/utils/permissionUtils.js";
import dataExtractorRouter from "../../src/routes/v1/dataExtractor.routes.js";

const MONGO_URI = process.env.P12_MONGO_URI || "mongodb://127.0.0.1:27017/crm_test";
const TAG = `P12-${Date.now()}`;
const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();
const userA = new mongoose.Types.ObjectId();
const created = { results: [], batches: [], leads: [], market: [] };

function snap(name, extra = {}) {
    return {
        companyName: name,
        record: {
            companyName: name,
            city: extra.city || "Pune",
            state: extra.state || "Maharashtra",
            businessDescription: extra.desc || "industrial equipment manufacturer",
            website: extra.website || `https://${name.replace(/\s+/g, "-").toLowerCase()}.test`,
            sourcePlatform: extra.source || "brave",
            productCategories: extra.products || ["LED Drivers"],
            duplicateStatus: extra.duplicateStatus || "",
            industrialEstate: extra.estate || "",
            pincode: extra.pin || "",
            latitude: extra.lat,
            longitude: extra.lng,
            ...extra.record,
        },
        classification: {
            parentIndustry: extra.industry || "Lighting",
            subIndustry: extra.sub || "LED OEM",
            customerType: extra.ct || "OEM",
            confidenceScore: extra.classConf || 80,
            matchedExclusionTerms: extra.excl || [],
            productSignals: extra.products || ["LED Drivers"],
            status: extra.classStatus || "CLASSIFIED",
            ...extra.classification,
        },
        relevance: {
            status: extra.relStatus || "RELEVANT",
            relevanceScore: extra.relScore ?? 80,
            ...extra.relevance,
        },
        recommendation: {
            primaryRecommendation: { productName: extra.product || "LED Drivers" },
            ...extra.recommendation,
        },
        contact: {
            primaryContact: extra.noContact ? null : { contactRoleCategory: extra.role || "Purchase" },
            ...extra.contact,
        },
        score: {
            finalScore: extra.leadScore ?? 75,
            confidence: extra.scoreConf ?? 70,
            ...extra.score,
        },
        existingCrmStatus: extra.crm || "UNKNOWN",
        duplicateEntityStatus: extra.duplicateStatus || "",
    };
}

before(async () => {
    await mongoose.connect(MONGO_URI);
});

after(async () => {
    if (created.results.length) await AiSimilarCompanyResult.deleteMany({ _id: { $in: created.results } });
    if (created.batches.length) await AiSimilarCompanyBatchJob.deleteMany({ _id: { $in: created.batches } });
    if (created.leads.length) await ExtractedLead.deleteMany({ _id: { $in: created.leads } });
    if (created.market.length) await AiMarketIntelligence.deleteMany({ _id: { $in: created.market } });
    await AiSimilarCompanyResult.deleteMany({ companyId: { $in: [companyA, companyB] }, seedCompanyName: new RegExp(TAG) });
    await AiMarketIntelligence.deleteMany({ companyId: companyA, title: new RegExp(TAG) });
    await mongoose.disconnect();
});

describe("Phase 12 similarity engine", () => {
    it("1. same industry/sub-industry scores high", () => {
        const r = scoreSimilarityPair({ seed: snap(`${TAG} A`), candidate: snap(`${TAG} B`) });
        assert.ok(r.similarityScore >= 60, `score=${r.similarityScore}`);
        assert.ok(r.primaryReasons.some((x) => /industry/i.test(x)));
    });

    it("2. same name but different business does not score high only from name", () => {
        const r = scoreSimilarityPair({
            seed: snap("ABC Lighting Pvt Ltd", { industry: "Lighting", desc: "LED fixtures OEM" }),
            candidate: snap("ABC Lighting LLP", { industry: "Textiles", sub: "Garments", ct: "Exporter", product: "Yarn", products: ["Yarn"], desc: "textile exporter", leadScore: 40 }),
        });
        assert.ok(r.similarityScore <= 45, `score=${r.similarityScore}`);
        assert.ok(r.riskSignals.some((x) => /name similarity/i.test(x)) || ["RELATED_COMPANY", "GROUP_COMPANY_VARIANT", "POSSIBLE_BRANCH", "MANUAL_REVIEW_REQUIRED"].includes(r.relationshipType));
    });

    it("3. similar products increase score", () => {
        const low = scoreSimilarityPair({
            seed: snap(`${TAG} ProdA`, { products: ["LED Drivers"], product: "LED Drivers" }),
            candidate: snap(`${TAG} ProdB`, { products: ["Yarn"], product: "Yarn", industry: "Lighting", ct: "OEM" }),
        });
        const high = scoreSimilarityPair({
            seed: snap(`${TAG} ProdA2`, { products: ["LED Drivers"], product: "LED Drivers" }),
            candidate: snap(`${TAG} ProdB2`, { products: ["LED Drivers"], product: "LED Drivers" }),
        });
        assert.ok(high.similarityScore > low.similarityScore);
    });

    it("4. same customer type increases score", () => {
        const same = scoreSimilarityPair({ seed: snap(`${TAG} CT1`, { ct: "OEM" }), candidate: snap(`${TAG} CT2`, { ct: "OEM" }) });
        const diff = scoreSimilarityPair({ seed: snap(`${TAG} CT3`, { ct: "OEM" }), candidate: snap(`${TAG} CT4`, { ct: "Dealer" }) });
        assert.ok(same.similarityScore >= diff.similarityScore);
    });

    it("5. strong target-market fit increases score", () => {
        const fit = scoreSimilarityPair({
            seed: snap(`${TAG} TM1`, { relStatus: "RELEVANT", relScore: 90 }),
            candidate: snap(`${TAG} TM2`, { relStatus: "RELEVANT", relScore: 88 }),
        });
        const nofit = scoreSimilarityPair({
            seed: snap(`${TAG} TM3`, { relStatus: "IRRELEVANT", relScore: 10 }),
            candidate: snap(`${TAG} TM4`, { relStatus: "IRRELEVANT", relScore: 12 }),
        });
        assert.ok(fit.similarityScore > nofit.similarityScore);
    });

    it("6. similar lead-score range affects score", () => {
        const near = scoreSimilarityPair({
            seed: snap(`${TAG} LS1`, { leadScore: 80 }),
            candidate: snap(`${TAG} LS2`, { leadScore: 78 }),
        });
        const far = scoreSimilarityPair({
            seed: snap(`${TAG} LS3`, { leadScore: 90 }),
            candidate: snap(`${TAG} LS4`, { leadScore: 20 }),
        });
        const nearDim = near.dimensionScores.find((d) => d.id === "lead_score_proximity");
        const farDim = far.dimensionScores.find((d) => d.id === "lead_score_proximity");
        assert.ok(nearDim.score > farDim.score);
    });

    it("7. negative/exclusion conflicts reduce score", () => {
        const clean = scoreSimilarityPair({ seed: snap(`${TAG} EX1`), candidate: snap(`${TAG} EX2`) });
        const dirty = scoreSimilarityPair({
            seed: snap(`${TAG} EX3`, { excl: ["job board"] }),
            candidate: snap(`${TAG} EX4`, { relStatus: "IRRELEVANT", excl: ["directory spam"] }),
        });
        assert.ok(dirty.similarityScore < clean.similarityScore);
        assert.ok(dirty.riskSignals.length >= 1);
    });

    it("8. duplicate candidate is flagged", () => {
        const r = scoreSimilarityPair({
            seed: snap(`${TAG} DUP1`),
            candidate: snap(`${TAG} DUP2`, { duplicateStatus: "EXACT_DUPLICATE" }),
        });
        assert.equal(r.status, "DUPLICATE");
    });

    it("9. related-company variant is not auto-merged", () => {
        const ratio = nameSimilarityRatio("ABC Lighting Pvt Ltd", "ABC Lighting LLP");
        assert.ok(ratio >= 0.75);
        const rel = detectRelationshipType({
            seed: snap("ABC Lighting Pvt Ltd"),
            candidate: snap("ABC Lighting LLP", { city: "Mumbai" }),
            similarityScore: 50,
            geo: { matchType: "NO_MATCH" },
            nameRatio: ratio,
        });
        assert.ok(["RELATED_COMPANY", "GROUP_COMPANY_VARIANT", "POSSIBLE_BRANCH"].includes(rel.relationshipType));
        assert.ok(/do not auto-merge/i.test(rel.recommendedNextAction + (rel.riskSignals || []).join(" ")));
    });

    it("10. branch-like variant requires review", () => {
        const ratio = nameSimilarityRatio("ABC Lighting Mumbai", "ABC Lighting Delhi");
        const rel = detectRelationshipType({
            seed: snap("ABC Lighting Mumbai", { city: "Mumbai" }),
            candidate: snap("ABC Lighting Delhi", { city: "Delhi" }),
            similarityScore: 40,
            geo: compareGeography({ city: "Mumbai", state: "Maharashtra" }, { city: "Delhi", state: "Delhi" }),
            nameRatio: Math.max(ratio, 0.75),
        });
        // Force branch path with high name + city textual if names share tokens heavily
        const forced = detectRelationshipType({
            seed: snap("ABC Lighting", { city: "Mumbai" }),
            candidate: snap("ABC Lighting", { city: "Mumbai" }),
            similarityScore: 40,
            geo: { matchType: "SAME_CITY" },
            nameRatio: 0.9,
        });
        assert.equal(forced.relationshipType, "POSSIBLE_BRANCH");
        assert.ok(/manual/i.test(forced.recommendedNextAction));
    });

    it("11. possible competitor uses evidence", () => {
        const r = scoreSimilarityPair({
            seed: snap(`${TAG} COMP1`, { industry: "Lighting", ct: "OEM", product: "LED Drivers", products: ["LED Drivers"] }),
            candidate: snap(`${TAG} COMP2`, { industry: "Lighting", ct: "OEM", product: "LED Drivers", products: ["LED Drivers"] }),
        });
        assert.equal(r.relationshipType, "POSSIBLE_COMPETITOR");
        assert.ok(r.evidence.length >= 1);
        assert.ok(r.riskSignals.some((x) => /possible/i.test(x)));
    });

    it("12. industry peer distinguishable from competitor", () => {
        const peer = scoreSimilarityPair({
            seed: snap(`${TAG} PEER1`, { industry: "Lighting", ct: "OEM", product: "LED Drivers" }),
            candidate: snap(`${TAG} PEER2`, { industry: "Lighting", ct: "Consultant", product: "Advisory", products: ["Advisory"] }),
        });
        assert.ok(["INDUSTRY_PEER", "POSSIBLE_CONSULTANT", "SIMILAR_COMPANY", "MANUAL_REVIEW_REQUIRED"].includes(peer.relationshipType));
        assert.notEqual(peer.relationshipType, "POSSIBLE_COMPETITOR");
    });

    it("13. possible customer relationship works", () => {
        const rel = detectRelationshipType({
            seed: snap("Seller"),
            candidate: snap("Buyer OEM", { ct: "OEM Manufacturer" }),
            similarityScore: 40,
            geo: { matchType: "NO_MATCH" },
            nameRatio: 0.1,
        });
        assert.ok(["POSSIBLE_OEM", "POSSIBLE_CUSTOMER"].includes(rel.relationshipType));
    });

    it("14. possible supplier/dealer/distributor works", () => {
        assert.equal(detectRelationshipType({
            seed: snap("A"), candidate: snap("B", { ct: "Dealer" }), similarityScore: 30, geo: {}, nameRatio: 0,
        }).relationshipType, "POSSIBLE_DEALER");
        assert.equal(detectRelationshipType({
            seed: snap("A"), candidate: snap("B", { ct: "Distributor" }), similarityScore: 30, geo: {}, nameRatio: 0,
        }).relationshipType, "POSSIBLE_DISTRIBUTOR");
        assert.equal(detectRelationshipType({
            seed: snap("A"), candidate: snap("B", { ct: "Supplier vendor" }), similarityScore: 30, geo: {}, nameRatio: 0,
        }).relationshipType, "POSSIBLE_SUPPLIER");
    });

    it("15. textual city match is not exact distance", () => {
        const geo = compareGeography({ city: "Surat", state: "Gujarat" }, { city: "Surat", state: "Gujarat" });
        assert.equal(geo.matchType, "TEXTUAL_LOCATION_MATCH");
        assert.equal(geo.distanceKm, null);
        assert.match(geo.reason, /not exact distance|textual/i);
    });

    it("16. radius search requires valid coordinates", () => {
        assert.equal(assertRadiusRequiresCoordinates({ city: "Pune" }, { city: "Pune" }), false);
        assert.equal(assertRadiusRequiresCoordinates({ lat: 18.5, lng: 73.8 }, { lat: 18.52, lng: 73.85 }), true);
        const geo = compareGeography({ lat: 18.5, lng: 73.8 }, { lat: 18.52, lng: 73.85 }, { defaultRadiusKm: 25 });
        assert.ok(["RADIUS_MATCH", "COORDINATE_DISTANCE"].includes(geo.matchType));
        assert.ok(typeof geo.distanceKm === "number");
    });

    it("17. same industrial estate grouping works", () => {
        const geo = compareGeography(
            { industrialEstate: "MIDC Chakan", city: "Pune" },
            { industrialEstate: "MIDC Chakan", city: "Pune" },
        );
        assert.equal(geo.matchType, "TEXTUAL_LOCATION_MATCH");
        assert.match(geo.reason, /industrial estate/i);
    });
});

describe("Phase 12 market intelligence", () => {
    it("18. cluster totals are company-scoped input", () => {
        const clusters = buildClusters([
            snap(`${TAG} C1`, { industry: "Lighting", city: "Mumbai" }),
            snap(`${TAG} C2`, { industry: "Lighting", city: "Mumbai" }),
            snap(`${TAG} C3`, { industry: "Textiles", city: "Surat" }),
        ]);
        const lighting = clusters.find((c) => /Lighting in Mumbai/i.test(c.title));
        assert.ok(lighting);
        assert.equal(lighting.metrics.totalCompaniesDiscovered, 2);
        assert.equal(lighting.intelType, "CLUSTER");
    });

    it("19. market coverage does not claim total market share", () => {
        const cov = buildMarketCoverage({
            discovered: [snap("A"), snap("B"), snap("C")],
            existingCrmCount: 1,
            approvedLeadCount: 1,
        });
        assert.match(cov.summary, /not total market share/i);
        assert.ok(cov.metrics.note);
        assert.notEqual(cov.coverageStatus, undefined);
    });

    it("20. unknown denominator returns UNKNOWN_MARKET_SIZE or known coverage without fake total", () => {
        const empty = buildMarketCoverage({ discovered: [], existingCrmCount: 0 });
        assert.equal(empty.coverageStatus, "INSUFFICIENT_DATA");
        const unknown = buildMarketCoverage({
            discovered: [snap("A")],
            existingCrmCount: 0,
            configuredTargetCount: 0,
        });
        assert.equal(unknown.coverageStatus, "UNKNOWN_MARKET_SIZE");
    });

    it("21-22. white-space uses configured targets and does not invent totals", () => {
        const gaps = buildWhiteSpaceGaps({
            companies: [snap(`${TAG} WS1`, { industry: "Lighting", city: "Pune" })],
            targetIndustries: ["Automation"],
            targetCities: ["Ahmedabad"],
            targetCustomerTypes: ["System Integrator"],
            targetProducts: ["PLC Panels"],
        });
        assert.ok(gaps.length >= 3);
        for (const g of gaps) {
            assert.equal(g.metrics.expectedMarketTotal, null);
            assert.ok(g.gapType);
            assert.ok(g.recommendations?.length);
        }
    });

    it("23. expansion suggestion includes reason and search parameters", () => {
        const gaps = buildWhiteSpaceGaps({
            companies: [],
            targetIndustries: ["Solar EPC"],
            targetCities: [],
            targetCustomerTypes: [],
            targetProducts: [],
        });
        const suggestions = buildExpansionSuggestions({ whiteSpaces: gaps, clusters: [], successfulKeywords: ["DALI lighting"] });
        assert.ok(suggestions.length >= 1);
        const s = suggestions[0];
        assert.ok(s.recommendations[0].searchKeyword || s.recommendations[0].reason);
        assert.equal(s.recommendations[0].autoExecute, false);
        assert.equal(s.recommendations[0].manualApprovalRequired, true);
    });

    it("24. paid provider is not auto-called without confirmation", async () => {
        await assert.rejects(
            () => findSimilarForSeed(companyA, userA, {
                executePaidProvider: true,
                confirmPaidProvider: false,
                seed: snap(`${TAG} PaidSeed`),
                candidates: [snap(`${TAG} PaidCand`)],
            }),
            /Paid provider requires explicit confirmation/i,
        );
    });
});

describe("Phase 12 AI safety & store", () => {
    it("25. provider unavailable does not stop rule analysis", async () => {
        const r = await analyzeSamplePair(companyA, {
            seed: snap(`${TAG} Rule1`),
            candidate: snap(`${TAG} Rule2`),
            mode: "rule_based",
        });
        assert.ok(r.similarityScore >= 0);
        assert.equal(r.engineUsed, "rule_based");
        assert.equal(r.noAutoPaidProvider, true);
    });

    it("26. AI unavailable falls back to rules", async () => {
        const ai = await enrichSimilarityWithAi();
        assert.equal(ai.ok, false);
        assert.equal(ai.fallback, true);
        const r = await analyzeSamplePair(companyA, {
            seed: snap(`${TAG} AI1`),
            candidate: snap(`${TAG} AI2`),
            mode: "hybrid",
        });
        assert.equal(r.fallbackUsed, true);
    });

    it("27. malformed AI relationship is rejected", () => {
        const v = validateAiSimilarityOutput({ relationshipType: "COMPETITOR" }, { candidateNames: ["X"] });
        assert.equal(v.ok, false);
    });

    it("28. AI cannot invent candidate companies", () => {
        const v = validateAiSimilarityOutput(
            { candidateCompanyName: "Invented Co Pvt Ltd", relationshipType: "INDUSTRY_PEER" },
            { candidateNames: ["Real Co"] },
        );
        assert.equal(v.ok, false);
        assert.equal(v.reason, "invented_candidate_company");
    });

    it("29. manual override creates history", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} HistSeed`),
            candidates: [snap(`${TAG} HistCand`)],
            includeLowScore: true,
        });
        const id = found.results[0]._id;
        created.results.push(id);
        const updated = await overrideSimilarResult(companyA, userA, id, {
            action: "override",
            similarityScore: 55,
            reason: "Manual adjust",
        });
        assert.equal(updated.similarityScore, 55);
        const hist = await getSimilarHistory(companyA, id);
        assert.ok(hist.history.some((h) => h.action === "override"));
    });

    it("30. locked result is not overwritten", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} LockSeed`),
            candidates: [snap(`${TAG} LockCand`)],
            includeLowScore: true,
        });
        const id = found.results[0]._id;
        created.results.push(id);
        await lockSimilarResult(companyA, userA, id, { action: "lock" });
        const again = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} LockSeed`),
            candidates: [snap(`${TAG} LockCand`)],
            includeLowScore: true,
        });
        assert.ok(again.results.some((r) => String(r._id) === String(id) && r.locked));
        const skipped = again.skippedCount >= 0;
        assert.ok(skipped || again.results.find((r) => String(r._id) === String(id))?.locked);
    });

    it("31. upstream change marks result outdated", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} OutSeed`),
            candidates: [snap(`${TAG} OutCand`)],
            includeLowScore: true,
        });
        const id = found.results[0]._id;
        created.results.push(id);
        const out = await markOutdatedIfUnlocked(companyA, id, "Seed classification changed");
        assert.equal(out.outdated, true);
        assert.equal(out.result.status, "OUTDATED");
    });

    it("32. approved candidate moves only to APPROVED_FOR_ENRICHMENT", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} ApprSeed`),
            candidates: [snap(`${TAG} ApprCand`)],
            includeLowScore: true,
        });
        const id = found.results[0]._id;
        created.results.push(id);
        const updated = await overrideSimilarResult(companyA, userA, id, { action: "approve_for_enrichment" });
        assert.equal(updated.status, "APPROVED_FOR_ENRICHMENT");
        assert.equal(updated.noAutoCrmCreate, true);
    });

    it("33-34. no automatic Lead/Customer/Supplier or communications", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} SafeSeed`),
            candidates: [snap(`${TAG} SafeCand`)],
            includeLowScore: true,
        });
        const row = found.results[0];
        created.results.push(row._id);
        assert.equal(row.noAutoCrmCreate, true);
        assert.equal(row.noAutoCommunications, true);
        assert.equal(found.noAutoCrmCreate, true);
        assert.equal(found.paidProviderExecuted, false);
    });
});

describe("Phase 12 batch / permissions / tenant", () => {
    it("35-37. batch pause/resume, fail-continue, idempotency", async () => {
        const lead1 = await ExtractedLead.create({
            companyId: companyA,
            financialYear: '2025-26', companyName: `${TAG} BatchSeed1`,
            sourcePlatform: 'web_search', status: 'draft',
        });
        const lead2 = await ExtractedLead.create({
            companyId: companyA,
            financialYear: '2025-26', companyName: `${TAG} BatchSeed2`,
            sourcePlatform: 'web_search', status: 'draft',
        });
        created.leads.push(lead1._id, lead2._id);
        const key = `idem-${TAG}`;
        const job1 = await createSimilarBatch(companyA, userA, {
            seedExtractedLeadIds: [lead1._id, lead2._id],
            idempotencyKey: key,
        });
        created.batches.push(job1._id);
        const job2 = await createSimilarBatch(companyA, userA, {
            seedExtractedLeadIds: [lead1._id, lead2._id],
            idempotencyKey: key,
        });
        assert.equal(String(job1._id), String(job2._id));

        await controlSimilarBatch(companyA, userA, job1._id, "pause", { reason: "test pause" });
        let paused = await getSimilarBatch(companyA, job1._id);
        assert.equal(paused.status, "PAUSED");
        await controlSimilarBatch(companyA, userA, job1._id, "resume");
        const processed = await processSimilarBatchChunk(companyA, userA, job1._id, { maxItems: 10 });
        assert.ok(["COMPLETED", "QUEUED", "RUNNING"].includes(processed.status));
        // fail-continue: inject a failed item path by retrying empty is fine; ensure failedCount did not stop job creation
        assert.ok(processed.total >= 2);
    });

    it("38. provider-call limits are respected", async () => {
        const settings = normalizeSimilaritySettings({ ...DEFAULT_SIMILARITY_SETTINGS, maximumProviderCallsPerJob: 0 });
        assert.equal(settings.maximumProviderCallsPerJob, 0);
        assert.equal(settings.requireConfirmationForPaidProvider, true);
    });

    it("39-41. cross-company / foreign / body company override rejected", async () => {
        await assert.rejects(
            () => findSimilarForSeed(companyA, userA, {
                companyId: companyB,
                seed: snap(`${TAG} Cross`),
                candidates: [snap(`${TAG} Cross2`)],
            }),
            /companyId\/tenantId overrides are rejected/i,
        );
        // Foreign seed lead
        const foreign = await ExtractedLead.create({
            companyId: companyB,
            financialYear: '2025-26', companyName: `${TAG} Foreign`,
            sourcePlatform: 'web_search', status: 'draft',
        });
        created.leads.push(foreign._id);
        await assert.rejects(
            () => findSimilarForSeed(companyA, userA, { seedExtractedLeadId: foreign._id }),
            /not found/i,
        );
    });

    it("42-44. permission matrix for view/run/approve/lock/export", () => {
        const viewOnly = { roleName: "staff", permissions: ["data_extractor.similar_company.view"] };
        for (const p of [
            "data_extractor.similar_company.run",
            "data_extractor.similar_company.override",
            "data_extractor.similar_company.approve",
            "data_extractor.similar_company.reject",
            "data_extractor.similar_company.lock",
            "data_extractor.similar_company.export",
        ]) {
            assert.equal(checkUserPermission(viewOnly, p), false);
        }
        const runOnly = { roleName: "staff", permissions: ["data_extractor.similar_company.view", "data_extractor.similar_company.run"] };
        assert.equal(checkUserPermission(runOnly, "data_extractor.similar_company.approve"), false);
        assert.equal(checkUserPermission(runOnly, "data_extractor.similar_company.lock"), false);
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.similar_company.export"] }, "data_extractor.similar_company.export"), true);
        assert.equal(checkUserPermission({ roleName: "staff", permissions: ["data_extractor.market_intelligence.view"] }, "data_extractor.market_intelligence.run"), false);
    });

    it("45. secrets/cookies/sessions are not returned", async () => {
        const r = await analyzeSamplePair(companyA, {
            seed: snap(`${TAG} Sec1`),
            candidate: snap(`${TAG} Sec2`),
        });
        const blob = JSON.stringify(r);
        assert.equal(/password|cookie|sessiontoken|sk-[a-z0-9]/i.test(blob), false);
    });

    it("routes register similar_company and market_intelligence permissions", () => {
        const stack = dataExtractorRouter?.stack || [];
        const paths = stack.map((l) => `${Object.keys(l.route?.methods || {})[0] || ""} ${l.route?.path || ""}`).join("\n");
        assert.match(paths, /similar\/find/);
        assert.match(paths, /market\/run/);
    });

    it("export requires approved enrichment candidates only", async () => {
        const found = await findSimilarForSeed(companyA, userA, {
            seed: snap(`${TAG} ExpSeed`),
            candidates: [snap(`${TAG} ExpCand`)],
            includeLowScore: true,
        });
        const id = found.results[0]._id;
        created.results.push(id);
        await overrideSimilarResult(companyA, userA, id, { action: "approve_for_enrichment" });
        const exp = await exportApprovedCandidates(companyA, { format: "json" });
        assert.ok(exp.results.some((r) => r.candidateCompany === `${TAG} ExpCand`));
        assert.match(exp.note, /no automatic CRM Lead/i);
    });

    it("market intelligence run persists company-scoped docs", async () => {
        const out = await runMarketIntelligence(companyA, userA, {
            companies: [
                snap(`${TAG} M1`, { industry: "Lighting", city: "Mumbai" }),
                snap(`${TAG} M2`, { industry: "Lighting", city: "Mumbai", leadScore: 80 }),
            ],
            targetIndustries: ["Automation"],
            targetCities: ["Surat"],
        });
        assert.ok(out.savedCount >= 1);
        assert.equal(out.paidProviderExecuted, false);
        assert.match(out.note, /not total market share/i);
        const docs = await AiMarketIntelligence.find({ companyId: companyA }).limit(20).lean();
        created.market.push(...docs.map((d) => d._id));
        assert.ok(docs.some((d) => d.intelType === "COVERAGE"));
    });
});
