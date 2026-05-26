import { Lead } from '../models/lead.model.js';
import { ProductCatalog } from '../models/productCatalog.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logActivity } from './leadActivity.service.js';

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

export async function createLead(body, userId) {
    const doc = await Lead.create({
        ...body,
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
    const lead = await Lead.create({
        source: 'whatsapp',
        status: 'new',
        customerName: body.customerName || '',
        customerMobile: body.customerMobile || '',
        assignedTo: body.assignedTo || null,
        priority: body.priority || 'medium',
        notes: body.notes || '',
        whatsapp: {
            messageText: body.messageText,
            receivedAt: body.receivedAt || new Date(),
            threadRef: body.threadRef || '',
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
        },
        createdBy: userId,
        updatedBy: userId,
    });
    await logActivity({
        leadId: lead._id,
        type: 'message_saved',
        payload: {
            messagePreview: String(body.messageText || '').slice(0, 200),
            mobile: body.customerMobile || '',
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

export async function queryLeads(filter, options) {
    const q = {};
    if (filter.status) q.status = filter.status;
    if (filter.source) q.source = filter.source;
    if (filter.assignedTo) q.assignedTo = filter.assignedTo;
    if (filter.search) {
        const re = new RegExp(String(filter.search).trim(), 'i');
        q.$or = [
            { customerName: re },
            { customerMobile: re },
            { customerEmail: re },
            { notes: re },
            { 'whatsapp.messageText': re },
        ];
    }

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

    return { results, page, limit, totalResults, totalPages: Math.ceil(totalResults / limit) };
}

export async function getLeadById(id) {
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
    return doc;
}

export async function updateLead(id, patch, userId) {
    const doc = await Lead.findById(id);
    if (!doc) throw new ApiError(404, 'Lead not found');

    const prevStatus = doc.status;
    const prevAssigned = doc.assignedTo ? String(doc.assignedTo) : '';
    const prevFollow = doc.nextFollowUpDate ? doc.nextFollowUpDate.toISOString() : '';
    const prevProductCount = doc.products?.length || 0;

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
    if (patch.assignedTo !== undefined && String(patch.assignedTo || '') !== prevAssigned) {
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

    return getLeadById(id);
}

export async function deleteLead(id) {
    const doc = await Lead.findById(id);
    if (!doc) throw new ApiError(404, 'Lead not found');
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

export async function shareAsset(id, { catalogProductId, assetType, channel = 'whatsapp', url }, userId) {
    const lead = await Lead.findById(id);
    if (!lead) throw new ApiError(404, 'Lead not found');

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

    return getLeadById(id);
}
