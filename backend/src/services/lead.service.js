import ExcelJS from 'exceljs';
import { Lead } from '../models/lead.model.js';
import { Task } from '../models/task.model.js';
import { User } from '../models/user.model.js';
import { ProductCatalog } from '../models/productCatalog.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logActivity } from './leadActivity.service.js';
import {
    buildLeadListQueryFilter,
    canViewAllLeads,
    isLeadAdmin,
    userCanAccessLead,
    userCanAssignLead,
    userCanEditLead,
} from '../utils/leadVisibility.js';

function normalizeWhatsAppLeadMobile(raw) {
    const val = String(raw || '').trim();
    const digits = val.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (val.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return '';
}

function buildSort(sortBy) {
    if (!sortBy) return { createdAt: -1 };
    const parts = String(sortBy).split(',');
    const out = {};
    for (const p of parts) {
        const [k, o] = p.split(':');
        if (k) out[k] = o === 'asc' ? 1 : -1;
    }
    return out;
}

function formatLeadNo(doc) {
    const id = String(doc._id || '');
    return `L-${id.slice(-8).toUpperCase()}`;
}

function contactPersonFromLead(doc) {
    const cp = doc.customerId?.contactPersons;
    if (Array.isArray(cp) && cp.length) {
        const first = cp[0];
        return first?.name || first?.contactPerson || '';
    }
    return '';
}

function displayOwnerName(doc) {
    if (doc.ownerName) return doc.ownerName;
    if (doc.ownerUserId) return 'Assigned';
    if (doc.createdByName) return doc.createdByName;
    if (doc.createdBy) return 'Legacy';
    return 'Unassigned';
}

async function userDisplayName(userId) {
    if (!userId) return '';
    const u = await User.findById(userId).select('name').lean();
    return u?.name || '';
}

async function buildOwnerFieldsForCreate(userId, body = {}) {
    const creatorName = await userDisplayName(userId);
    const assignId = body.assignedTo || body.assignedToUserId || null;
    const assignName = assignId ? await userDisplayName(assignId) : '';
    const ownerId = assignId || userId;
    const ownerName = assignId ? assignName : creatorName;

    return {
        createdByUserId: userId,
        createdByName: creatorName || 'Unknown',
        ownerUserId: ownerId,
        ownerName: ownerName || creatorName || 'Unknown',
        assignedToUserId: assignId || null,
        assignedToName: assignName || '',
        assignedTo: assignId || null,
    };
}

async function syncAssignmentFields(doc, assignedTo, userId) {
    const assignId = assignedTo || null;
    const assignName = assignId ? await userDisplayName(assignId) : '';
    doc.assignedTo = assignId;
    doc.assignedToUserId = assignId;
    doc.assignedToName = assignName || '';
    if (assignId) {
        doc.ownerUserId = assignId;
        doc.ownerName = assignName || 'Unknown';
    }
    doc.updatedBy = userId;
}

function ensureLegacyOwnerFields(doc) {
    if (!doc.createdByUserId && doc.createdBy) {
        doc.createdByUserId = doc.createdBy;
    }
    if (!doc.ownerUserId && doc.createdByUserId) {
        doc.ownerUserId = doc.createdByUserId;
        doc.ownerName = doc.createdByName || doc.ownerName;
    }
    if (!doc.assignedToUserId && doc.assignedTo) {
        doc.assignedToUserId = doc.assignedTo;
    }
    if (!doc.ownerName && !doc.ownerUserId && !doc.createdByUserId && !doc.createdBy) {
        doc.ownerName = doc.ownerName || 'Unassigned';
    }
    return doc;
}

export async function createLead(body, userId) {
    const ownerFields = await buildOwnerFieldsForCreate(userId, body);
    const doc = await Lead.create({
        ...body,
        ...ownerFields,
        createdBy: userId,
        updatedBy: userId,
    });
    await logActivity({
        leadId: doc._id,
        type: 'created',
        payload: { source: doc.source, status: doc.status },
        userId,
    });
    if (doc.products && doc.products.length) {
        await logActivity({
            leadId: doc._id,
            type: 'product_selected',
            payload: { count: doc.products.length },
            userId,
        });
    }
    return doc;
}

export async function createLeadFromWhatsApp(body, userId) {
    const normalizedMobile = normalizeWhatsAppLeadMobile(body.customerMobile || body.normalizedMobile || '');
    if (!normalizedMobile) {
        throw new ApiError(400, 'Invalid or missing WhatsApp mobile number');
    }
    const ownerFields = await buildOwnerFieldsForCreate(userId, body);
    const lead = await Lead.create({
        source: 'whatsapp',
        status: 'new',
        customerName: body.customerName || '',
        customerMobile: normalizedMobile,
        priority: body.priority || 'medium',
        notes: body.notes || '',
        whatsapp: {
            messageText: body.messageText,
            receivedAt: body.receivedAt || new Date(),
            threadRef: body.threadRef || '',
            whatsappChatId: body.whatsappChatId || '',
            whatsappName: body.whatsappName || body.customerName || '',
            rawWhatsAppId: body.rawWhatsAppId || '',
            normalizedMobile,
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
        },
        ...ownerFields,
        createdBy: userId,
        updatedBy: userId,
    });
    await logActivity({
        leadId: lead._id,
        type: 'message_saved',
        payload: {
            messagePreview: String(body.messageText || '').slice(0, 200),
            mobile: normalizedMobile,
        },
        userId,
    });
    await logActivity({
        leadId: lead._id,
        type: 'converted',
        payload: { source: 'whatsapp' },
        userId,
    });
    return lead;
}

export async function queryLeads(filter, options, user, settings) {
    const q = buildLeadListQueryFilter(user, settings, filter);

    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 25;
    const skip = (page - 1) * limit;

    const [results, totalResults] = await Promise.all([
        Lead.find(q)
            .sort(buildSort(options.sortBy))
            .skip(skip)
            .limit(limit)
            .populate('assignedTo', 'name email')
            .populate('customerId', 'customerName company contactPersons')
            .populate('products.catalogProductId', 'name code imageUrl'),
        Lead.countDocuments(q),
    ]);

    const mapped = results.map((r) => {
        const o = r.toObject();
        ensureLegacyOwnerFields(o);
        return o;
    });

    return {
        results: mapped,
        page,
        limit,
        totalResults,
        totalPages: Math.ceil(totalResults / limit),
        visibilityScope: canViewAllLeads(user, settings) ? 'all' : 'own',
    };
}

export async function getLeadById(id, user, settings) {
    const doc = await Lead.findById(id)
        .populate('assignedTo', 'name email')
        .populate('customerId', 'customerName company contactPersons')
        .populate(
            'products.catalogProductId',
            'name code category imageUrl catalogPdfUrl datasheetPdfUrl brochureUrl videoUrl shortDescription technicalSpecs',
        )
        .populate(
            'sharedAssets.catalogProductId',
            'name code imageUrl catalogPdfUrl datasheetPdfUrl brochureUrl videoUrl',
        )
        .populate('sharedAssets.sharedBy', 'name email');
    if (!doc) throw new ApiError(404, 'Lead not found');
    if (user && settings && !userCanAccessLead(user, doc, settings)) {
        throw new ApiError(403, 'Access denied');
    }
    const o = doc.toObject();
    ensureLegacyOwnerFields(o);
    return o;
}

export async function updateLead(id, patch, userId, user, settings) {
    const doc = await Lead.findById(id);
    if (!doc) throw new ApiError(404, 'Lead not found');
    if (user && settings && !userCanEditLead(user, doc, settings)) {
        throw new ApiError(403, 'Access denied');
    }

    const prevStatus = doc.status;
    const prevAssigned = doc.assignedTo ? String(doc.assignedTo) : '';
    const prevFollow = doc.nextFollowUpDate ? doc.nextFollowUpDate.toISOString() : '';
    const prevProductCount = doc.products?.length || 0;

    let assignmentChanged = false;
    if (patch.assignedTo !== undefined) {
        if (!userCanAssignLead(user)) {
            throw new ApiError(403, 'Lead assign permission required');
        }
        assignmentChanged = String(patch.assignedTo || '') !== prevAssigned;
        await syncAssignmentFields(doc, patch.assignedTo || null, userId);
        delete patch.assignedTo;
    }

    if (patch.ownerUserId !== undefined && userCanAssignLead(user)) {
        const ownerId = patch.ownerUserId || null;
        const ownerName = ownerId ? await userDisplayName(ownerId) : 'Unassigned';
        doc.ownerUserId = ownerId;
        doc.ownerName = ownerName;
        delete patch.ownerUserId;
        delete patch.ownerName;
    }

    Object.assign(doc, patch);
    doc.updatedBy = userId;
    await doc.save();

    if (patch.status && patch.status !== prevStatus) {
        await logActivity({
            leadId: doc._id,
            type: 'status_changed',
            payload: { from: prevStatus, to: doc.status },
            userId,
        });
    }
    if (assignmentChanged) {
        await logActivity({
            leadId: doc._id,
            type: 'assigned',
            payload: { to: String(doc.assignedTo || '') },
            userId,
        });
    }
    if (patch.nextFollowUpDate !== undefined) {
        const nowFollow = doc.nextFollowUpDate ? doc.nextFollowUpDate.toISOString() : '';
        if (nowFollow !== prevFollow) {
            await logActivity({
                leadId: doc._id,
                type: 'followup_scheduled',
                payload: { nextFollowUpDate: nowFollow },
                userId,
            });
        }
    }
    if (patch.products && (doc.products?.length || 0) !== prevProductCount) {
        await logActivity({
            leadId: doc._id,
            type: 'product_selected',
            payload: { count: doc.products?.length || 0 },
            userId,
        });
    }
    if (patch.notes !== undefined) {
        await logActivity({
            leadId: doc._id,
            type: 'note_added',
            payload: { preview: String(patch.notes || '').slice(0, 200) },
            userId,
        });
    }

    return getLeadById(id, user, settings);
}

export async function deleteLead(id, user, settings) {
    const doc = await Lead.findById(id);
    if (!doc) throw new ApiError(404, 'Lead not found');
    if (user && settings && !userCanEditLead(user, doc, settings)) {
        throw new ApiError(403, 'Access denied');
    }
    await doc.deleteOne();
    return { _id: id };
}

const ASSET_URL_FIELDS = {
    catalog: 'catalogPdfUrl',
    datasheet: 'datasheetPdfUrl',
    brochure: 'brochureUrl',
    image: 'imageUrl',
    video: 'videoUrl',
};

export async function shareAsset(id, { catalogProductId, assetType, channel = 'whatsapp', url }, userId, user, settings) {
    const lead = await Lead.findById(id);
    if (!lead) throw new ApiError(404, 'Lead not found');
    if (user && settings && !userCanAccessLead(user, lead, settings)) {
        throw new ApiError(403, 'Access denied');
    }

    let resolvedUrl = url || '';
    if (!resolvedUrl) {
        const product = await ProductCatalog.findById(catalogProductId);
        if (!product) throw new ApiError(404, 'Product not found in catalog');
        const field = ASSET_URL_FIELDS[assetType];
        resolvedUrl = field ? product[field] || '' : '';
    }

    lead.sharedAssets.push({
        catalogProductId,
        assetType,
        url: resolvedUrl,
        channel,
        sharedBy: userId,
        sharedAt: new Date(),
    });
    lead.updatedBy = userId;
    await lead.save();

    await logActivity({
        leadId: lead._id,
        type: 'asset_shared',
        payload: { catalogProductId, assetType, channel, url: resolvedUrl },
        userId,
    });

    return getLeadById(id, user, settings);
}

function mapLeadReportRow(doc) {
    ensureLegacyOwnerFields(doc);
    const assignDisplay = doc.assignedToName
        || doc.assignedTo?.name
        || (doc.assignedToUserId ? 'Assigned' : '');
    const ownerDisplay = doc.ownerName || displayOwnerName(doc);
    return {
        leadNo: formatLeadNo(doc),
        leadDate: doc.createdAt,
        customerName: doc.customerName || doc.customerId?.customerName || '',
        companyName: doc.customerId?.company || doc.customerName || '',
        contactPerson: contactPersonFromLead(doc),
        mobile: doc.customerMobile || '',
        source: doc.source || '',
        status: doc.status || '',
        createdByName: doc.createdByName || doc.createdBy?.name || 'Unassigned',
        ownerName: ownerDisplay,
        assignedToName: assignDisplay || ownerDisplay,
        followUpDate: doc.nextFollowUpDate,
        createdAt: doc.createdAt,
        _id: doc._id,
    };
}

export async function queryLeadReport(filter, options, user, settings) {
    const q = buildLeadListQueryFilter(user, settings, filter);
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 50;
    const skip = (page - 1) * limit;

    const [docs, totalResults] = await Promise.all([
        Lead.find(q)
            .sort(buildSort(options.sortBy || 'createdAt:desc'))
            .skip(skip)
            .limit(limit)
            .populate('assignedTo', 'name')
            .populate('customerId', 'customerName company contactPersons')
            .lean(),
        Lead.countDocuments(q),
    ]);

    return {
        results: docs.map((d) => mapLeadReportRow(d)),
        page,
        limit,
        totalResults,
        totalPages: Math.ceil(totalResults / limit),
        visibilityScope: canViewAllLeads(user, settings) ? 'all' : 'own',
    };
}

export async function exportLeadReportExcel(filter, user, settings) {
    const { results } = await queryLeadReport(filter, { page: 1, limit: 10000 }, user, settings);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Lead Report');
    worksheet.columns = [
        { header: 'Lead No.', key: 'leadNo', width: 14 },
        { header: 'Lead Date', key: 'leadDate', width: 14 },
        { header: 'Customer/Company', key: 'customerName', width: 28 },
        { header: 'Contact Person', key: 'contactPerson', width: 18 },
        { header: 'Mobile', key: 'mobile', width: 16 },
        { header: 'Lead Source', key: 'source', width: 12 },
        { header: 'Lead Status', key: 'status', width: 12 },
        { header: 'Created By', key: 'createdByName', width: 18 },
        { header: 'Owner / Assigned To', key: 'ownerName', width: 22 },
        { header: 'Follow-up Date', key: 'followUpDate', width: 14 },
        { header: 'Created At', key: 'createdAt', width: 18 },
    ];
    results.forEach((r) => {
        worksheet.addRow({
            leadNo: r.leadNo,
            leadDate: r.leadDate ? new Date(r.leadDate).toLocaleDateString() : '',
            customerName: r.customerName || r.companyName,
            contactPerson: r.contactPerson,
            mobile: r.mobile,
            source: r.source,
            status: r.status,
            createdByName: r.createdByName,
            ownerName: r.assignedToName || r.ownerName,
            followUpDate: r.followUpDate ? new Date(r.followUpDate).toLocaleDateString() : '',
            createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
        });
    });
    return workbook.xlsx.writeBuffer();
}

export async function getLeadTasks(leadId, user, settings) {
    const lead = await Lead.findById(leadId).lean();
    if (!lead) throw new ApiError(404, 'Lead not found');
    if (!userCanAccessLead(user, lead, settings)) throw new ApiError(403, 'Access denied');
    const tasks = await Task.find({ leadId })
        .sort({ dueDate: 1 })
        .populate('assigneeIds', 'name email')
        .populate('createdBy', 'name')
        .lean();
    return tasks;
}

export async function createTaskFromLead(leadId, body, user, settings) {
    const lead = await Lead.findById(leadId)
        .populate('customerId', 'customerName company contactPersons')
        .lean();
    if (!lead) throw new ApiError(404, 'Lead not found');
    if (!userCanAccessLead(user, lead, settings)) throw new ApiError(403, 'Access denied');

    const companyLabel = lead.customerName || lead.customerId?.customerName || lead.customerId?.company || 'Lead';
    const title = body.title || `Follow-up for ${companyLabel}`;
    const assigneeId = body.assigneeId || lead.ownerUserId || lead.assignedToUserId || lead.assignedTo || user._id || user.id;
    const dueDate = body.dueDate
        ? new Date(body.dueDate)
        : lead.nextFollowUpDate
            ? new Date(lead.nextFollowUpDate)
            : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const descriptionParts = [
        body.description || '',
        lead.notes ? `Lead notes: ${lead.notes}` : '',
        lead.source ? `Source: ${lead.source}` : '',
        lead.customerMobile ? `Mobile: ${lead.customerMobile}` : '',
    ].filter(Boolean);

    const task = await Task.create({
        title: String(title).trim(),
        description: descriptionParts.join('\n').trim(),
        priority: body.priority || 'MEDIUM',
        status: body.status || 'OPEN',
        assignmentMode: 'SINGLE',
        assigneeIds: [assigneeId],
        assignToAll: false,
        dueDate,
        createdBy: user._id || user.id,
        customerId: lead.customerId || null,
        leadId: lead._id,
        referenceNumber: `LEAD:${lead._id}`,
        remarks: body.remarks || `Linked to lead ${formatLeadNo(lead)}`,
    });

    await logActivity({
        leadId: lead._id,
        type: 'task_created',
        payload: { taskId: String(task._id), title: task.title },
        userId: user._id || user.id,
    });

    return task;
}

export async function getLeadVisibilityMeta(user, settings) {
    const viewAll = canViewAllLeads(user, settings);
    let users = [];
    if (viewAll || isLeadAdmin(user)) {
        users = await User.find({ isActive: { $ne: false } }).select('name email').sort({ name: 1 }).lean();
    }
    return {
        visibilityScope: viewAll ? 'all' : 'own',
        canFilterUsers: viewAll || isLeadAdmin(user),
        canAssign: userCanAssignLead(user),
        users: users.map((u) => ({ _id: u._id, name: u.name, email: u.email })),
    };
}

/** Safe one-time style backfill for legacy leads (no other fields changed). */
export async function backfillLeadOwnerFields({ dryRun = true } = {}) {
    const cursor = Lead.find({
        $or: [
            { createdByUserId: { $exists: false } },
            { createdByUserId: null },
            { ownerUserId: { $exists: false } },
            { ownerUserId: null, createdBy: { $exists: true, $ne: null } },
        ],
    }).cursor();

    let scanned = 0;
    let updated = 0;
    const userNameCache = new Map();

    for await (const doc of cursor) {
        scanned += 1;
        const patch = {};
        const creatorId = doc.createdByUserId || doc.createdBy;
        if (creatorId && !doc.createdByUserId) {
            patch.createdByUserId = creatorId;
            if (!doc.createdByName) {
                const key = String(creatorId);
                if (!userNameCache.has(key)) {
                    userNameCache.set(key, await userDisplayName(creatorId));
                }
                patch.createdByName = userNameCache.get(key) || 'Unknown';
            }
        }
        if (!doc.ownerUserId && (patch.createdByUserId || doc.createdByUserId || doc.createdBy)) {
            const oid = patch.createdByUserId || doc.createdByUserId || doc.createdBy;
            patch.ownerUserId = oid;
            if (!doc.ownerName) {
                const key = String(oid);
                if (!userNameCache.has(key)) {
                    userNameCache.set(key, await userDisplayName(oid));
                }
                patch.ownerName = userNameCache.get(key) || 'Unknown';
            }
        }
        if (doc.assignedTo && !doc.assignedToUserId) {
            patch.assignedToUserId = doc.assignedTo;
            if (!doc.assignedToName) {
                const key = String(doc.assignedTo);
                if (!userNameCache.has(key)) {
                    userNameCache.set(key, await userDisplayName(doc.assignedTo));
                }
                patch.assignedToName = userNameCache.get(key) || '';
            }
        }
        if (!patch.ownerUserId && !doc.ownerUserId && !doc.createdBy && !doc.createdByUserId) {
            patch.ownerName = 'Unassigned';
        }
        if (Object.keys(patch).length === 0) continue;
        updated += 1;
        if (!dryRun) {
            await Lead.updateOne({ _id: doc._id }, { $set: patch });
        }
    }

    return { scanned, updated, dryRun };
}
