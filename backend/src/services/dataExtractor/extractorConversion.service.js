import { ExtractedLead } from '../../models/extractedLead.model.js';
import { Lead } from '../../models/lead.model.js';
import Customer from '../../models/customer.model.js';
import { Supplier } from '../../models/supplier.model.js';
import { createLead, updateLead } from '../lead.service.js';
import customerService from '../customer.service.js';
import followupService from '../followup.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { checkDuplicateForRecord } from './duplicateChecker.service.js';

function leadPriorityFromScore(score) {
    const n = Number(score) || 0;
    if (n >= 70) return 'high';
    if (n >= 40) return 'medium';
    return 'low';
}

async function assertApprovedRecord(companyId, id) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Record not found');
    if (doc.status === 'converted') throw new ApiError(400, 'Record already converted');
    if (doc.status === 'rejected') throw new ApiError(400, 'Rejected records cannot be converted');
    if (doc.status !== 'approved' && doc.status !== 'reviewed') {
        throw new ApiError(400, 'Record must be approved before conversion');
    }
    if (doc.duplicateStatus === 'confirmed_duplicate') {
        throw new ApiError(409, 'Confirmed duplicate — cannot convert. Review duplicate matches first.');
    }
    return doc;
}

function buildLeadNotes(doc) {
    return [
        doc.businessDescription,
        doc.website ? `Website: ${doc.website}` : '',
        doc.city ? `Location: ${[doc.city, doc.stateProvince, doc.country].filter(Boolean).join(', ')}` : '',
        `Imported from Data Extractor (${doc.sourcePlatform})`,
    ].filter(Boolean).join('\n');
}

export async function getExtractedRecordDuplicates(companyId, id) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId }).lean();
    if (!doc) throw new ApiError(404, 'Record not found');
    return checkDuplicateForRecord(companyId, doc);
}

export async function convertExtractedToLead(companyId, id, userId) {
    const doc = await assertApprovedRecord(companyId, id);
    const lead = await createLead({
        source: 'data_extractor',
        status: 'new',
        priority: leadPriorityFromScore(doc.leadScore),
        customerName: doc.companyName,
        customerMobile: doc.mobile || doc.phone || '',
        customerEmail: doc.email || '',
        notes: buildLeadNotes(doc),
        extractorRef: {
            extractedLeadId: doc._id,
            sourcePlatform: doc.sourcePlatform || '',
            sourceUrl: doc.sourceUrl || doc.website || '',
            convertedAt: new Date(),
        },
    }, userId);

    doc.status = 'converted';
    doc.convertedTo = {
        entityType: 'lead',
        refId: lead._id,
        convertedAt: new Date(),
        convertedBy: userId,
    };
    await doc.save();

    return { extractedLead: doc.toObject(), lead };
}

export async function convertExtractedToCustomer(companyId, id, userId) {
    const doc = await assertApprovedRecord(companyId, id);
    const customer = await customerService.createCustomer({
        customerName: doc.companyName,
        company: doc.companyName,
        tradeName: doc.companyName,
        companyEmail: doc.email || undefined,
        website: doc.website || '',
        address: doc.address || '',
        city: doc.city || '',
        state: doc.stateProvince || '',
        country: doc.country || 'India',
        pincode: doc.pincode || '',
        contactPersons: doc.phone || doc.mobile ? [{
            name: doc.companyName,
            mobile: doc.mobile || doc.phone,
            email: doc.email || undefined,
            isPrimary: true,
        }] : [],
        createdBy: userId,
        updatedBy: userId,
    });

    doc.status = 'converted';
    doc.convertedTo = {
        entityType: 'customer',
        refId: customer._id,
        convertedAt: new Date(),
        convertedBy: userId,
    };
    await doc.save();

    return { extractedLead: doc.toObject(), customer };
}

export async function convertExtractedToSupplier(companyId, id, userId) {
    const doc = await assertApprovedRecord(companyId, id);
    const supplier = await Supplier.create({
        supplierName: doc.companyName,
        phone: doc.phone || '',
        whatsApp: doc.mobile || doc.whatsappNumber || '',
        email: doc.email || '',
        address: doc.address || '',
        city: doc.city || '',
        state: doc.stateProvince || '',
        country: doc.country || 'India',
        pincode: doc.pincode || '',
        remarks: doc.businessDescription || '',
        createdBy: userId,
        updatedBy: userId,
    });

    doc.status = 'converted';
    doc.convertedTo = {
        entityType: 'supplier',
        refId: supplier._id,
        convertedAt: new Date(),
        convertedBy: userId,
    };
    await doc.save();

    return { extractedLead: doc.toObject(), supplier };
}

export async function scheduleFollowupForExtracted(companyId, id, userId, body = {}, user = null) {
    const doc = await ExtractedLead.findOne({ _id: id, companyId });
    if (!doc) throw new ApiError(404, 'Record not found');
    if (doc.status !== 'converted' || !doc.convertedTo?.refId) {
        throw new ApiError(400, 'Record must be converted before scheduling follow-up');
    }

    const nextDate = body.nextCallDate || body.nextFollowUpDate;
    if (!nextDate) throw new ApiError(400, 'nextCallDate is required');

    const { entityType, refId } = doc.convertedTo;

    if (entityType === 'lead') {
        const lead = await updateLead(
            refId,
            {
                nextFollowUpDate: new Date(nextDate),
                priority: body.priority || undefined,
                notes: body.whatToTalkNext
                    ? `${doc.notes || ''}\nFollow-up: ${body.whatToTalkNext}`.trim()
                    : undefined,
            },
            userId,
            user,
            null,
        );
        return { type: 'lead', lead };
    }

    if (entityType === 'customer') {
        const followup = await followupService.createFollowup({
            customerId: refId,
            nextCallDate: new Date(nextDate),
            nextCallTime: body.nextCallTime || '10:00',
            whatToTalkNext: body.whatToTalkNext || `Follow up: ${doc.companyName} (from Data Extractor)`,
            priority: body.priority || 'medium',
            reminderEnabled: body.reminderEnabled !== false,
            followUpType: body.followUpType || 'CALL',
            createdBy: userId,
        });
        return { type: 'customer_followup', followup };
    }

    throw new ApiError(400, 'Follow-up is only available for converted leads or customers');
}
