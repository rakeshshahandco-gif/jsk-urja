import mongoose from 'mongoose';
import { KnowledgeGraphNode } from '../../../models/knowledgeGraphNode.model.js';
import { KnowledgeGraphRelationship } from '../../../models/knowledgeGraphRelationship.model.js';
import { KnowledgeGraphEvidence } from '../../../models/knowledgeGraphEvidence.model.js';
import { KnowledgeGraphHistory } from '../../../models/knowledgeGraphHistory.model.js';
import { KnowledgeGraphSavedView } from '../../../models/knowledgeGraphSavedView.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
    assertView, assertSearch, assertRelationships, assertAnalytics, assertExport, assertManage, hasKg,
} from './permissions.util.js';
import { PERMS } from './constants.js';
import { rejectTenantOverrides, assertNoSecrets, clampLimit, stripInjected } from './normalize.util.js';
import { getKgSettings } from './settings.service.js';
import { buildExplanation } from './scoring.service.js';

function oid(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
    return new mongoose.Types.ObjectId(String(id));
}

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

export async function searchGraph(companyId, query = {}, user = null) {
    assertSearch(user);
    rejectTenantOverrides(query);
    const settings = await getKgSettings(companyId);
    const limit = clampLimit(query.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const minConfidence = Number(query.minConfidence ?? settings.minConfidenceToShow) || 0;
    const q = { companyId, ...notDeleted() };

    if (query.nodeType) q.nodeType = query.nodeType;
    if (query.q) {
        q.$or = [
            { label: new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            { nodeKey: new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ];
    }

    // Relationship-oriented search phrases
    const phrase = String(query.q || query.intent || '').toLowerCase();
    let relationshipType = query.relationshipType || null;
    if (!relationshipType) {
        if (/sister/.test(phrase)) relationshipType = 'SisterCompany';
        else if (/\boems?\b/.test(phrase)) relationshipType = 'PotentialOEM';
        else if (/distributor/.test(phrase)) relationshipType = 'PotentialDistributor';
        else if (/dealer/.test(phrase)) relationshipType = 'PotentialDealer';
        else if (/competitor/.test(phrase)) relationshipType = 'Competitor';
        else if (/similar/.test(phrase)) relationshipType = 'SimilarCompany';
        else if (/dali|smart switch|product ecosystem|shared product/.test(phrase)) relationshipType = 'ProductRecommended';
        else if (/same website|shared website|shared domain/.test(phrase)) relationshipType = 'SharedWebsite';
        else if (/director/.test(phrase)) relationshipType = 'SharedDirector';
        else if (/group|business group/.test(phrase)) relationshipType = 'GroupCompany';
        else if (/duplicate/.test(phrase)) relationshipType = 'PotentialDuplicate';
        else if (/cross[- ]?sell/.test(phrase)) relationshipType = 'PotentialCrossSell';
    }

    if (relationshipType || query.relatedTo) {
        const relQ = {
            companyId,
            ...notDeleted(),
            confidence: { $gte: minConfidence },
        };
        if (relationshipType) relQ.relationshipType = relationshipType;
        if (query.relatedTo) {
            const center = await resolveNode(companyId, query.relatedTo);
            relQ.$or = [{ fromNodeId: center._id }, { toNodeId: center._id }];
        }
        const rels = await KnowledgeGraphRelationship.find(relQ)
            .sort({ confidence: -1 }).limit(limit).lean();
        return {
            mode: 'relationships',
            relationshipType,
            items: rels.map(publicRelationship),
            total: rels.length,
            explainable: true,
        };
    }

    const nodes = await KnowledgeGraphNode.find(q).sort({ updatedAt: -1 }).limit(limit).lean();
    return {
        mode: 'nodes',
        items: nodes.map(publicNode),
        total: nodes.length,
    };
}

async function resolveNode(companyId, idOrKey) {
    const id = oid(idOrKey);
    let node = null;
    if (id) {
        node = await KnowledgeGraphNode.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    }
    if (!node) {
        node = await KnowledgeGraphNode.findOne({ companyId, nodeKey: String(idOrKey), ...notDeleted() }).lean();
    }
    if (!node) {
        node = await KnowledgeGraphNode.findOne({
            companyId,
            label: new RegExp(`^${String(idOrKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            nodeType: 'Company',
            ...notDeleted(),
        }).lean();
    }
    if (!node) throw new ApiError(404, 'Node not found');
    if (String(node.companyId) !== String(companyId)) throw new ApiError(404, 'Node not found');
    return node;
}

export async function getNode(companyId, nodeId, user = null) {
    assertView(user);
    const node = await resolveNode(companyId, nodeId);
    return publicNode(node);
}

export async function listRelationships(companyId, query = {}, user = null) {
    assertRelationships(user);
    rejectTenantOverrides(query);
    const settings = await getKgSettings(companyId);
    const limit = clampLimit(query.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const q = {
        companyId,
        ...notDeleted(),
        confidence: { $gte: Number(query.minConfidence ?? settings.minConfidenceToShow) || 0 },
    };
    if (query.relationshipType) q.relationshipType = query.relationshipType;
    if (query.freshness) q.freshness = query.freshness;
    if (query.nodeId) {
        const node = await resolveNode(companyId, query.nodeId);
        q.$or = [{ fromNodeId: node._id }, { toNodeId: node._id }];
    }
    const items = await KnowledgeGraphRelationship.find(q).sort({ confidence: -1 }).limit(limit).lean();
    return { items: items.map(publicRelationship), total: items.length };
}

export async function explainRelationship(companyId, relationshipId, user = null) {
    assertRelationships(user);
    const id = oid(relationshipId);
    if (!id) throw new ApiError(400, 'Invalid relationship id');
    const rel = await KnowledgeGraphRelationship.findOne({ _id: id, companyId, ...notDeleted() }).lean();
    if (!rel) throw new ApiError(404, 'Relationship not found');
    const evidence = await KnowledgeGraphEvidence.find({
        companyId,
        relationshipId: rel._id,
        ...notDeleted(),
    }).sort({ confidenceContribution: -1 }).limit(40).lean();

    const explanation = buildExplanation({
        relationshipType: rel.relationshipType,
        reason: rel.reason,
        evidence,
        confidence: rel.confidence,
        source: rel.source,
        discoveryMethod: rel.discoveryMethod,
        freshness: rel.freshness,
        limitations: rel.limitations || [],
    });
    assertNoSecrets(explanation);
    return {
        relationship: publicRelationship(rel),
        explanation: {
            ...explanation,
            why: stripInjected(explanation.why),
            lastUpdated: rel.updatedAt,
            manualOverride: !!rel.manualOverride,
            locked: !!rel.locked,
            version: rel.version,
            approvalStatus: rel.approvalStatus,
        },
        evidence: evidence.map((e) => ({
            id: String(e._id),
            field: e.field,
            displayValue: e.displayValue,
            reason: e.reason,
            sourceModule: e.sourceModule,
            confidenceContribution: e.confidenceContribution,
            freshness: e.freshness,
        })),
    };
}

export async function getGraphView(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const settings = await getKgSettings(companyId);
    if (!query.center && !query.nodeId && !query.q) {
        throw new ApiError(400, 'center/nodeId required for graph visualization');
    }
    const center = await resolveNode(companyId, query.center || query.nodeId || query.q);
    const maxNodes = clampLimit(query.limit, settings.maximumGraphNodes, settings.maximumGraphNodes);
    const minConfidence = Number(query.minConfidence ?? settings.minConfidenceToShow) || 0;

    const rels = await KnowledgeGraphRelationship.find({
        companyId,
        ...notDeleted(),
        confidence: { $gte: minConfidence },
        $or: [{ fromNodeId: center._id }, { toNodeId: center._id }],
    }).sort({ confidence: -1 }).limit(maxNodes).lean();

    const nodeIds = new Set([String(center._id)]);
    for (const r of rels) {
        nodeIds.add(String(r.fromNodeId));
        nodeIds.add(String(r.toNodeId));
    }
    const nodes = await KnowledgeGraphNode.find({
        companyId,
        _id: { $in: [...nodeIds].map((id) => new mongoose.Types.ObjectId(id)) },
        ...notDeleted(),
    }).lean();

    // Simple radial layout for UI (deterministic)
    const satellites = nodes.filter((n) => String(n._id) !== String(center._id));
    const laidOut = [
        { ...publicNode(center), x: 0, y: 0, isCenter: true },
        ...satellites.map((n, i) => {
            const angle = (2 * Math.PI * i) / Math.max(satellites.length, 1);
            const radius = 220 + (i % 3) * 40;
            return {
                ...publicNode(n),
                x: Math.round(Math.cos(angle) * radius),
                y: Math.round(Math.sin(angle) * radius),
                isCenter: false,
            };
        }),
    ];

    return {
        center: publicNode(center),
        nodes: laidOut,
        edges: rels.map((r) => ({
            id: String(r._id),
            from: String(r.fromNodeId),
            to: String(r.toNodeId),
            type: r.relationshipType,
            label: r.relationshipType,
            confidence: r.confidence,
            reason: r.reason,
            freshness: r.freshness,
            executable: false,
        })),
        navigationOnly: true,
        noCrmMutation: true,
    };
}

export async function getSimilar(companyId, query = {}, user = null) {
    assertSearch(user);
    rejectTenantOverrides(query);
    const settings = await getKgSettings(companyId);
    const center = await resolveNode(companyId, query.nodeId || query.center || query.q);
    const limit = clampLimit(query.limit, settings.defaultResultLimit, settings.maximumResultLimit);
    const rels = await KnowledgeGraphRelationship.find({
        companyId,
        ...notDeleted(),
        relationshipType: { $in: ['SimilarCompany', 'Competitor', 'PotentialDuplicate', 'SisterCompany', 'GroupCompany'] },
        $or: [{ fromNodeId: center._id }, { toNodeId: center._id }],
    }).sort({ confidence: -1 }).limit(limit).lean();
    return {
        center: publicNode(center),
        items: rels.map(publicRelationship),
        engine: 'knowledge-graph-similarity',
        note: 'Similarity derived from stored evidence-backed relationships only.',
    };
}

export async function getAnalytics(companyId, user = null) {
    assertAnalytics(user);
    const [nodeCount, relCount, byType, byRelType, outdated] = await Promise.all([
        KnowledgeGraphNode.countDocuments({ companyId, ...notDeleted() }),
        KnowledgeGraphRelationship.countDocuments({ companyId, ...notDeleted() }),
        KnowledgeGraphNode.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), isDeleted: { $ne: true } } },
            { $group: { _id: '$nodeType', count: { $sum: 1 } } },
        ]),
        KnowledgeGraphRelationship.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), isDeleted: { $ne: true } } },
            { $group: { _id: '$relationshipType', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
            { $sort: { count: -1 } },
            { $limit: 30 },
        ]),
        KnowledgeGraphRelationship.countDocuments({ companyId, freshness: 'OUTDATED', ...notDeleted() }),
    ]);
    return {
        nodeCount,
        relationshipCount: relCount,
        outdatedRelationships: outdated,
        nodesByType: byType,
        relationshipsByType: byRelType,
        approximate: false,
        note: 'Counts are exact for this tenant graph only (coverage is not market-share).',
    };
}

export async function getHistory(companyId, query = {}, user = null) {
    assertView(user);
    rejectTenantOverrides(query);
    const limit = clampLimit(query.limit, 50, 200);
    const q = { companyId, ...notDeleted() };
    if (query.entityType) q.entityType = query.entityType;
    if (query.entityId && oid(query.entityId)) q.entityId = oid(query.entityId);
    const items = await KnowledgeGraphHistory.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    return { items };
}

export async function exportGraph(companyId, query = {}, user = null) {
    assertExport(user);
    rejectTenantOverrides(query);
    const settings = await getKgSettings(companyId);
    if (settings.allowExport === false) throw new ApiError(403, 'Export disabled');
    const [nodes, relationships] = await Promise.all([
        KnowledgeGraphNode.find({ companyId, ...notDeleted() }).limit(settings.maximumResultLimit).lean(),
        KnowledgeGraphRelationship.find({ companyId, ...notDeleted() }).limit(settings.maximumResultLimit).lean(),
    ]);
    const payload = {
        exportedAt: new Date().toISOString(),
        nodes: nodes.map(publicNode),
        relationships: relationships.map(publicRelationship),
        note: 'Read-only Knowledge Graph export. No CRM mutation.',
    };
    assertNoSecrets(payload);
    return payload;
}

export async function listSavedViews(companyId, userId, user) {
    assertView(user);
    const items = await KnowledgeGraphSavedView.find({
        companyId,
        ...notDeleted(),
        $or: [{ scope: 'COMPANY' }, { ownerUserId: userId }],
    }).sort({ updatedAt: -1 }).limit(100).lean();
    return { items };
}

export async function saveView(companyId, userId, body = {}, user = null) {
    // Saved views are KG metadata only (not CRM). Require manage or view+personal.
    assertView(user);
    rejectTenantOverrides(body);
    assertNoSecrets(body);
    if (body.scope === 'COMPANY' && !hasKg(user, PERMS.manage)) {
        throw new ApiError(403, `Missing permission: ${PERMS.manage}`);
    }
    const doc = await KnowledgeGraphSavedView.create({
        companyId,
        ownerUserId: userId,
        name: String(body.name || 'View').slice(0, 120),
        scope: body.scope === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
        filters: body.filters || {},
        centerNodeId: oid(body.centerNodeId),
        visibleRelationshipTypes: Array.isArray(body.visibleRelationshipTypes) ? body.visibleRelationshipTypes : [],
        createdBy: userId,
        updatedBy: userId,
    });
    return doc.toObject();
}

function publicNode(n) {
    return {
        id: String(n._id),
        nodeType: n.nodeType,
        nodeKey: n.nodeKey,
        label: n.label,
        sourceModule: n.sourceModule,
        sourceRecordId: n.sourceRecordId ? String(n.sourceRecordId) : null,
        attributes: n.attributes || {},
        freshness: n.freshness,
        locked: !!n.locked,
        version: n.version,
        discoveryMethod: n.discoveryMethod,
        updatedAt: n.updatedAt,
    };
}

function publicRelationship(r) {
    return {
        id: String(r._id),
        relationshipType: r.relationshipType,
        fromNodeId: String(r.fromNodeId),
        toNodeId: String(r.toNodeId),
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        fromNodeType: r.fromNodeType,
        toNodeType: r.toNodeType,
        confidence: r.confidence,
        reason: r.reason,
        explanation: r.explanation,
        source: r.source,
        discoveryMethod: r.discoveryMethod,
        approvalStatus: r.approvalStatus,
        freshness: r.freshness,
        version: r.version,
        locked: !!r.locked,
        manualOverride: !!r.manualOverride,
        evidenceSummary: r.evidenceSummary || [],
        limitations: r.limitations || [],
        updatedAt: r.updatedAt,
        // Always explainable
        explainable: true,
    };
}

export { resolveNode, assertManage };
