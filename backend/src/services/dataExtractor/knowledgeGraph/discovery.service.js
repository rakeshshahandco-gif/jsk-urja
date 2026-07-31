import mongoose from 'mongoose';
import { ExtractedLead } from '../../../models/extractedLead.model.js';
import { AiProductRecommendation } from '../../../models/aiProductRecommendation.model.js';
import { AiContactIntelligence } from '../../../models/aiContactIntelligence.model.js';
import { AiSimilarCompanyResult } from '../../../models/aiSimilarCompanyResult.model.js';
import { AiCrmEnrichmentDraft } from '../../../models/aiCrmEnrichmentDraft.model.js';
import { AiSalesWorkflowDraft } from '../../../models/aiSalesWorkflowDraft.model.js';
import { AiMarketingCampaignDraft } from '../../../models/aiMarketingCampaignDraft.model.js';
import { KnowledgeGraphNode } from '../../../models/knowledgeGraphNode.model.js';
import { KnowledgeGraphRelationship } from '../../../models/knowledgeGraphRelationship.model.js';
import { KnowledgeGraphEvidence } from '../../../models/knowledgeGraphEvidence.model.js';
import { KnowledgeGraphHistory } from '../../../models/knowledgeGraphHistory.model.js';
import {
    normalizeDomain, normalizeEmail, normalizePhone, emailDomain, fingerprint, stripInjected, assertNoSecrets,
} from './normalize.util.js';
import { scoreRelationship, buildExplanation } from './scoring.service.js';
import { assertManage } from './permissions.util.js';
import { ENGINE_VERSION } from './constants.js';

function notDeleted(extra = {}) {
    return { isDeleted: { $ne: true }, ...extra };
}

async function upsertNode(companyId, userId, payload) {
    const filter = {
        companyId,
        nodeType: payload.nodeType,
        nodeKey: payload.nodeKey,
        isDeleted: { $ne: true },
    };
    const update = {
        $set: {
            label: payload.label || payload.nodeKey,
            sourceModule: payload.sourceModule || '',
            sourceRecordId: payload.sourceRecordId || null,
            sourceRecordType: payload.sourceRecordType || '',
            attributes: payload.attributes || {},
            freshness: payload.freshness || 'CURRENT',
            discoveryMethod: payload.discoveryMethod || 'Rules Engine',
            updatedBy: userId || null,
        },
        $setOnInsert: {
            companyId,
            nodeType: payload.nodeType,
            nodeKey: payload.nodeKey,
            createdBy: userId || null,
            version: 1,
        },
            };
    const doc = await KnowledgeGraphNode.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    return doc;
}

async function upsertRelationship(companyId, userId, {
    relationshipType, fromNode, toNode, reason, source, discoveryMethod, evidenceItems = [], limitations = [],
}) {
    const a = String(fromNode._id);
    const b = String(toNode._id);
    const [left, right] = a < b ? [a, b] : [b, a];
    const relationshipKey = fingerprint([relationshipType, left, right]);

    const scored = scoreRelationship({ relationshipType, evidence: evidenceItems });
    const explanation = buildExplanation({
        relationshipType,
        reason,
        evidence: evidenceItems,
        confidence: scored.confidence,
        source,
        discoveryMethod,
        freshness: 'CURRENT',
        limitations,
    });

    assertNoSecrets({ reason, evidenceItems, explanation });

    const rel = await KnowledgeGraphRelationship.findOneAndUpdate(
        { companyId, relationshipKey, isDeleted: { $ne: true } },
        {
            $set: {
                relationshipType,
                fromNodeId: fromNode._id,
                toNodeId: toNode._id,
                fromNodeType: fromNode.nodeType,
                toNodeType: toNode.nodeType,
                fromLabel: fromNode.label,
                toLabel: toNode.label,
                confidence: scored.confidence,
                reason: stripInjected(reason),
                explanation: stripInjected(explanation.why),
                source: source || discoveryMethod || 'Rules Engine',
                discoveryMethod: discoveryMethod || 'Rules Engine',
                approvalStatus: 'DISCOVERED',
                freshness: 'CURRENT',
                evidenceSummary: evidenceItems.slice(0, 10),
                limitations: explanation.limitations,
                updatedBy: userId || null,
            },
            $setOnInsert: {
                companyId,
                relationshipKey,
                createdBy: userId || null,
                version: 1,
                locked: false,
                manualOverride: false,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Replace evidence docs for this relationship (KG-only write)
    await KnowledgeGraphEvidence.deleteMany({ companyId, relationshipId: rel._id });
    const evidenceDocs = [];
    for (const e of evidenceItems.slice(0, 20)) {
        const doc = await KnowledgeGraphEvidence.create({
            companyId,
            relationshipId: rel._id,
            fromNodeId: fromNode._id,
            toNodeId: toNode._id,
            evidenceType: e.evidenceType || 'rule_match',
            field: e.field || '',
            valueFingerprint: e.valueFingerprint || '',
            displayValue: stripInjected(e.displayValue || '').slice(0, 200),
            sourceModule: e.sourceModule || '',
            sourceRecordId: e.sourceRecordId || null,
            sourceUrl: '',
            reason: stripInjected(e.reason || ''),
            confidenceContribution: e.confidenceContribution ?? 0,
            freshness: e.freshness || 'CURRENT',
            untrustedTextSanitized: true,
        });
        evidenceDocs.push(doc._id);
    }
    if (evidenceDocs.length) {
        await KnowledgeGraphRelationship.updateOne(
            { _id: rel._id, companyId },
            { $set: { evidenceIds: evidenceDocs } },
        );
    }
    return rel;
}

function evidence(field, value, reason, weight, sourceModule, sourceRecordId) {
    return {
        evidenceType: 'rule_match',
        field,
        valueFingerprint: fingerprint([field, value]),
        displayValue: String(value || '').slice(0, 120),
        reason,
        confidenceContribution: weight,
        sourceModule,
        sourceRecordId: sourceRecordId || null,
        freshness: 'CURRENT',
    };
}

/**
 * Discover relationships from existing Phase 1–16 data into KG collections only.
 * Never mutates CRM Lead/Customer/Supplier/Task records.
 */
export async function discoverKnowledgeGraph(companyId, userId, options = {}, user = null) {
    if (user) assertManage(user);
    const limitLeads = Math.min(Number(options.limitLeads) || 300, 1000);

    const leads = await ExtractedLead.find({
        companyId,
        status: { $nin: ['rejected'] },
    }).sort({ updatedAt: -1 }).limit(limitLeads).lean();

    const nodeByLeadId = new Map();
    const byDomain = new Map();
    const byPhone = new Map();
    const byEmail = new Map();
    const byEmailDomain = new Map();
    const byIndustry = new Map();
    const stats = { nodes: 0, relationships: 0, leads: leads.length };

    for (const lead of leads) {
        const companyNode = await upsertNode(companyId, userId, {
            nodeType: 'Company',
            nodeKey: `company:extracted:${lead._id}`,
            label: lead.companyName || String(lead._id),
            sourceModule: 'extracted_leads',
            sourceRecordId: lead._id,
            sourceRecordType: 'ExtractedLead',
            attributes: {
                city: lead.city || '',
                state: lead.stateProvince || '',
                industry: lead.industry || '',
                website: lead.website || '',
                status: lead.status || '',
            },
            discoveryMethod: 'Lead Intelligence',
        });
        nodeByLeadId.set(String(lead._id), companyNode);
        stats.nodes += 1;

        if (lead.city || lead.stateProvince) {
            const locKey = fingerprint(['loc', lead.city, lead.stateProvince]);
            const locNode = await upsertNode(companyId, userId, {
                nodeType: 'Location',
                nodeKey: locKey,
                label: [lead.city, lead.stateProvince].filter(Boolean).join(', '),
                sourceModule: 'extracted_leads',
                discoveryMethod: 'Rules Engine',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'LocatedIn',
                fromNode: companyNode,
                toNode: locNode,
                reason: 'Company address/location fields on ExtractedLead',
                discoveryMethod: 'Shared Address',
                evidenceItems: [
                    evidence('location', locNode.label, 'same city/state fields on source record', 50, 'extracted_leads', lead._id),
                ],
            });
            stats.relationships += 1;
        }

        if (lead.industry) {
            const indNode = await upsertNode(companyId, userId, {
                nodeType: 'Industry',
                nodeKey: fingerprint(['industry', lead.industry]),
                label: lead.industry,
                sourceModule: 'extracted_leads',
                discoveryMethod: 'Lead Intelligence',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'SharedIndustry',
                fromNode: companyNode,
                toNode: indNode,
                reason: `Industry classification value "${lead.industry}" on ExtractedLead`,
                discoveryMethod: 'Lead Intelligence',
                evidenceItems: [
                    evidence('industry', lead.industry, 'industry field on extracted lead', 55, 'extracted_leads', lead._id),
                ],
            });
            stats.relationships += 1;
            const list = byIndustry.get(lead.industry.toLowerCase()) || [];
            list.push(companyNode);
            byIndustry.set(lead.industry.toLowerCase(), list);
        }

        const domain = normalizeDomain(lead.website || lead.normalizedDomain || '');
        if (domain) {
            const webNode = await upsertNode(companyId, userId, {
                nodeType: 'Website',
                nodeKey: fingerprint(['website', domain]),
                label: domain,
                sourceModule: 'extracted_leads',
                discoveryMethod: 'Website',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'SharedWebsite',
                fromNode: companyNode,
                toNode: webNode,
                reason: `Same website/domain observed: ${domain}`,
                discoveryMethod: 'Domain',
                evidenceItems: [
                    evidence('website', domain, 'normalized website/domain on ExtractedLead', 85, 'extracted_leads', lead._id),
                ],
            });
            stats.relationships += 1;
            const list = byDomain.get(domain) || [];
            list.push(companyNode);
            byDomain.set(domain, list);
        }

        const phone = normalizePhone(lead.phone);
        if (phone) {
            const phoneNode = await upsertNode(companyId, userId, {
                nodeType: 'Phone',
                nodeKey: fingerprint(['phone', phone]),
                label: phone,
                sourceModule: 'extracted_leads',
                discoveryMethod: 'Shared Phone',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'SharedPhone',
                fromNode: companyNode,
                toNode: phoneNode,
                reason: `Shared phone fingerprint ${phone}`,
                discoveryMethod: 'Shared Phone',
                evidenceItems: [
                    evidence('phone', phone, 'normalized phone on ExtractedLead', 80, 'extracted_leads', lead._id),
                ],
            });
            stats.relationships += 1;
            const list = byPhone.get(phone) || [];
            list.push(companyNode);
            byPhone.set(phone, list);
        }

        const email = normalizeEmail(lead.email);
        if (email) {
            const emailNode = await upsertNode(companyId, userId, {
                nodeType: 'Email',
                nodeKey: fingerprint(['email', email]),
                label: email,
                sourceModule: 'extracted_leads',
                discoveryMethod: 'Shared Email',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'SharedEmail',
                fromNode: companyNode,
                toNode: emailNode,
                reason: `Shared email ${email}`,
                discoveryMethod: 'Shared Email',
                evidenceItems: [
                    evidence('email', email, 'email on ExtractedLead', 75, 'extracted_leads', lead._id),
                ],
            });
            stats.relationships += 1;
            const list = byEmail.get(email) || [];
            list.push(companyNode);
            byEmail.set(email, list);
            const ed = emailDomain(email);
            if (ed && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'rediffmail.com'].includes(ed)) {
                const dlist = byEmailDomain.get(ed) || [];
                dlist.push(companyNode);
                byEmailDomain.set(ed, dlist);
            }
        }
    }

    // Company-to-company edges for shared attributes (PotentialDuplicate / Sister signals — evidence only)
    async function linkShared(map, relationshipType, field, weight, method) {
        for (const [value, nodes] of map.entries()) {
            if (nodes.length < 2) continue;
            const unique = [];
            const seen = new Set();
            for (const n of nodes) {
                const id = String(n._id);
                if (seen.has(id)) continue;
                seen.add(id);
                unique.push(n);
            }
            for (let i = 0; i < unique.length; i += 1) {
                for (let j = i + 1; j < unique.length; j += 1) {
                    const type = relationshipType === 'SharedDomain' || relationshipType === 'SharedPhone' || relationshipType === 'SharedEmail'
                        ? 'PotentialDuplicate'
                        : relationshipType;
                    await upsertRelationship(companyId, userId, {
                        relationshipType: type,
                        fromNode: unique[i],
                        toNode: unique[j],
                        reason: `Companies share ${field}: ${value}`,
                        discoveryMethod: method,
                        evidenceItems: [
                            evidence(field, value, `shared ${field} across ExtractedLead records`, weight, 'extracted_leads', null),
                        ],
                        limitations: ['Shared attribute suggests a possible link; not an approved merge.'],
                    });
                    // Also store the specific shared-* relationship to the attribute node already created;
                    // company-company link uses PotentialDuplicate/Similar for clarity.
                    if (relationshipType === 'SharedIndustry') {
                        await upsertRelationship(companyId, userId, {
                            relationshipType: 'SharedIndustry',
                            fromNode: unique[i],
                            toNode: unique[j],
                            reason: `Same industry value: ${value}`,
                            discoveryMethod: method,
                            evidenceItems: [
                                evidence('industry', value, 'shared industry field', weight, 'extracted_leads', null),
                            ],
                        });
                    }
                    stats.relationships += 1;
                }
            }
        }
    }

    await linkShared(byDomain, 'SharedDomain', 'website/domain', 85, 'Domain');
    await linkShared(byPhone, 'SharedPhone', 'phone', 80, 'Shared Phone');
    await linkShared(byEmail, 'SharedEmail', 'email', 75, 'Shared Email');
    await linkShared(byEmailDomain, 'SharedDomain', 'email-domain', 70, 'Domain');
    await linkShared(byIndustry, 'SharedIndustry', 'industry', 55, 'Lead Intelligence');

    // Product recommendations
    const recs = await AiProductRecommendation.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(200).lean();
    for (const rec of recs) {
        const companyNode = rec.extractedLeadId ? nodeByLeadId.get(String(rec.extractedLeadId)) : null;
        if (!companyNode) continue;
        const products = [
            rec.primaryRecommendation,
            ...(rec.secondaryRecommendations || []),
            ...(rec.crossSellOpportunities || []),
            ...(rec.upsellOpportunities || []),
        ].filter(Boolean);
        for (const p of products.slice(0, 8)) {
            const name = p.productName || p.name;
            if (!name) continue;
            const pNode = await upsertNode(companyId, userId, {
                nodeType: 'Product',
                nodeKey: fingerprint(['product', name]),
                label: name,
                sourceModule: 'product_recommendation',
                sourceRecordId: rec._id,
                discoveryMethod: 'Lead Intelligence',
            });
            const relType = p.role === 'cross_sell' || /cross/i.test(p.role || '')
                ? 'PotentialCrossSell'
                : (p.role === 'upsell' || /up.?sell/i.test(p.role || '') ? 'PotentialUpsell' : 'ProductRecommended');
            await upsertRelationship(companyId, userId, {
                relationshipType: relType,
                fromNode: companyNode,
                toNode: pNode,
                reason: `Stored Phase 8 recommendation: ${name}`,
                discoveryMethod: 'Lead Intelligence',
                evidenceItems: [
                    evidence('product', name, stripInjected(p.reason || 'product recommendation record'), 60, 'product_recommendation', rec._id),
                ],
            });
            stats.relationships += 1;
        }
    }

    // Contacts
    const contacts = await AiContactIntelligence.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(200).lean();
    for (const ci of contacts) {
        const companyNode = ci.extractedLeadId ? nodeByLeadId.get(String(ci.extractedLeadId)) : null;
        if (!companyNode) continue;
        for (const c of (ci.contacts || []).slice(0, 10)) {
            const label = c.contactName || c.email || c.phone || 'Contact';
            const key = fingerprint(['contact', c.email || c.phone || c.contactName || c.contactKey]);
            if (!key || key === 'contact') continue;
            const cNode = await upsertNode(companyId, userId, {
                nodeType: 'Contact',
                nodeKey: key,
                label,
                sourceModule: 'contact_intelligence',
                sourceRecordId: ci._id,
                attributes: {
                    role: c.contactRoleCategory || c.designation || '',
                    // do not store raw PII beyond what's needed for graph label in attributes for aggregate safety
                    hasEmail: !!c.email,
                    hasPhone: !!c.phone,
                },
                discoveryMethod: 'Shared Contact',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'SharedContact',
                fromNode: companyNode,
                toNode: cNode,
                reason: `Contact linked from Contact Intelligence: ${label}`,
                discoveryMethod: 'Shared Contact',
                evidenceItems: [
                    evidence('contact', label, 'contact intelligence record', 70, 'contact_intelligence', ci._id),
                ],
            });
            stats.relationships += 1;
        }
    }

    // Phase 12 similar companies
    const similar = await AiSimilarCompanyResult.find({ companyId, ...notDeleted() })
        .sort({ similarityScore: -1 }).limit(200).lean();
    for (const s of similar) {
        const sourceId = s.sourceExtractedLeadId || s.extractedLeadId || s.seedExtractedLeadId;
        const fromNode = sourceId ? nodeByLeadId.get(String(sourceId)) : null;
        if (!fromNode) continue;
        const candName = s.candidateCompanyName || s.companyName || 'Similar company';
        const toNode = await upsertNode(companyId, userId, {
            nodeType: 'Company',
            nodeKey: fingerprint(['similar-cand', candName, s._id]),
            label: candName,
            sourceModule: 'similar_company',
            sourceRecordId: s._id,
            discoveryMethod: 'Lead Intelligence',
            attributes: { similarityScore: s.similarityScore, storedRelationshipType: s.relationshipType || '' },
        });
        const relType = s.relationshipType === 'COMPETITOR' ? 'Competitor'
            : (s.relationshipType === 'OEM' ? 'PotentialOEM'
                : (s.relationshipType === 'DEALER' ? 'PotentialDealer'
                    : (s.relationshipType === 'DISTRIBUTOR' ? 'PotentialDistributor' : 'SimilarCompany')));
        await upsertRelationship(companyId, userId, {
            relationshipType: relType,
            fromNode,
            toNode,
            reason: `Phase 12 similar-company result (score ${s.similarityScore ?? 'n/a'})`,
            discoveryMethod: 'Lead Intelligence',
            evidenceItems: [
                evidence('similarityScore', s.similarityScore, 'stored similar-company score', Math.min(90, Number(s.similarityScore) || 70), 'similar_company', s._id),
            ],
        });
        stats.relationships += 1;
    }

    // CRM enrichment links (read draft status only)
    const crmDrafts = await AiCrmEnrichmentDraft.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(200).lean();
    for (const d of crmDrafts) {
        const companyNode = d.extractedLeadId ? nodeByLeadId.get(String(d.extractedLeadId)) : null;
        if (!companyNode) continue;
        const draftNode = await upsertNode(companyId, userId, {
            nodeType: 'Lead',
            nodeKey: `crm-draft:${d._id}`,
            label: `CRM Enrichment ${d.status}`,
            sourceModule: 'crm_enrichment',
            sourceRecordId: d._id,
            attributes: { status: d.status, applied: ['CONVERTED_TO_LEAD', 'ENRICHED_EXISTING_RECORD'].includes(d.status) },
            discoveryMethod: 'CRM Link',
        });
        await upsertRelationship(companyId, userId, {
            relationshipType: 'CrmLinked',
            fromNode: companyNode,
            toNode: draftNode,
            reason: `CRM Enrichment Draft status ${d.status} (draft not auto-applied by Knowledge Graph)`,
            discoveryMethod: 'CRM Link',
            evidenceItems: [
                evidence('crmDraftStatus', d.status, 'Phase 13 draft status read-only', 90, 'crm_enrichment', d._id),
            ],
            limitations: ['Knowledge Graph does not create or update CRM Leads.'],
        });
        stats.relationships += 1;
        if (d.convertedCrmLeadId) {
            const crmNode = await upsertNode(companyId, userId, {
                nodeType: 'CrmLead',
                nodeKey: `crm-lead:${d.convertedCrmLeadId}`,
                label: 'CRM Lead',
                sourceModule: 'crm_enrichment',
                sourceRecordId: d.convertedCrmLeadId,
                discoveryMethod: 'CRM Link',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'CrmLinked',
                fromNode: companyNode,
                toNode: crmNode,
                reason: 'convertedCrmLeadId present on enrichment draft',
                discoveryMethod: 'CRM Link',
                evidenceItems: [
                    evidence('convertedCrmLeadId', String(d.convertedCrmLeadId), 'stored CRM link on draft', 90, 'crm_enrichment', d._id),
                ],
            });
            stats.relationships += 1;
        }
    }

    // Sales workflow drafts
    const swDrafts = await AiSalesWorkflowDraft.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(200).lean();
    for (const d of swDrafts) {
        const companyNode = d.extractedLeadId ? nodeByLeadId.get(String(d.extractedLeadId)) : null;
        const anchor = companyNode || await upsertNode(companyId, userId, {
            nodeType: 'Company',
            nodeKey: fingerprint(['sw-company', d.companyName || d._id]),
            label: d.companyName || 'Workflow company',
            sourceModule: 'sales_workflow',
            sourceRecordId: d._id,
            discoveryMethod: 'CRM Link',
        });
        const swNode = await upsertNode(companyId, userId, {
            nodeType: 'SalesWorkflowDraft',
            nodeKey: `sw-draft:${d._id}`,
            label: `Sales Workflow ${d.status}`,
            sourceModule: 'sales_workflow',
            sourceRecordId: d._id,
            attributes: { status: d.status },
            discoveryMethod: 'CRM Link',
        });
        await upsertRelationship(companyId, userId, {
            relationshipType: 'WorkflowLinked',
            fromNode: anchor,
            toNode: swNode,
            reason: `Sales Workflow Draft status ${d.status} (not applied by Knowledge Graph)`,
            discoveryMethod: 'CRM Link',
            evidenceItems: [
                evidence('workflowStatus', d.status, 'Phase 14 draft status read-only', 80, 'sales_workflow', d._id),
            ],
            limitations: ['Knowledge Graph does not assign salespeople or create Tasks.'],
        });
        stats.relationships += 1;
    }

    // Campaign drafts
    const camps = await AiMarketingCampaignDraft.find({ companyId, ...notDeleted() })
        .sort({ updatedAt: -1 }).limit(100).lean();
    for (const c of camps) {
        const campNode = await upsertNode(companyId, userId, {
            nodeType: 'CampaignDraft',
            nodeKey: `campaign:${c._id}`,
            label: c.name || `Campaign ${c.status}`,
            sourceModule: 'marketing_intelligence',
            sourceRecordId: c._id,
            attributes: { status: c.status, handoffStatus: c.handoffStatus, sent: false },
            discoveryMethod: 'Lead Intelligence',
        });
        // Link campaign to industry/product filters if present in audience filters
        const industry = c.audienceFilters?.industry || c.audienceFilters?.parentIndustry;
        if (industry) {
            const indNode = await upsertNode(companyId, userId, {
                nodeType: 'Industry',
                nodeKey: fingerprint(['industry', industry]),
                label: industry,
                sourceModule: 'marketing_intelligence',
                discoveryMethod: 'Rules Engine',
            });
            await upsertRelationship(companyId, userId, {
                relationshipType: 'CampaignLinked',
                fromNode: campNode,
                toNode: indNode,
                reason: `Campaign audience filter industry: ${industry}`,
                discoveryMethod: 'Rules Engine',
                evidenceItems: [
                    evidence('audience.industry', industry, 'campaign draft audience filter', 70, 'marketing_intelligence', c._id),
                ],
                limitations: ['Handoff is not sent by Knowledge Graph.'],
            });
            stats.relationships += 1;
        }
    }

    await KnowledgeGraphHistory.create({
        companyId,
        entityType: 'DISCOVERY_RUN',
        entityId: new mongoose.Types.ObjectId(),
        action: 'DISCOVER',
        next: { ...stats, engineVersion: ENGINE_VERSION },
        reason: 'Deterministic relationship discovery from existing Data Extractor evidence',
        userId: userId || null,
        sourceType: 'system',
    });

    return {
        ...stats,
        engineVersion: ENGINE_VERSION,
        mutatedCrm: false,
        readOnlyCrm: true,
        note: 'Discovery writes only to Knowledge Graph collections. No CRM mutation.',
    };
}
