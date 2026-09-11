/**
 * Safe delete of Simple Lead Search bulk data.
 * Keeps a lightweight session/campaign tombstone. Never deletes CRM Lead/Customer.
 */
import { AssistedCaptureSession } from '../../../../models/assistedCaptureSession.model.js';
import { AssistedCaptureEvent } from '../../../../models/assistedCaptureEvent.model.js';
import { SearchCampaign } from '../../../../models/searchCampaign.model.js';
import { SearchQuery } from '../../../../models/searchQuery.model.js';
import { RawCapture } from '../../../../models/rawCapture.model.js';
import { RawCaptureBatch } from '../../../../models/rawCaptureBatch.model.js';
import { RawCaptureImportRun } from '../../../../models/rawCaptureImportRun.model.js';
import {
    RawCaptureEnrichment,
    RawCaptureEnrichmentJob,
} from '../../../../models/rawCaptureEnrichment.model.js';
import {
    RawCaptureQualification,
    RawCaptureQualificationJob,
    RawCaptureLocationRecheckJob,
} from '../../../../models/rawCaptureQualification.model.js';
import {
    RawCaptureGenuineness,
    RawCaptureGenuinenessJob,
} from '../../../../models/rawCaptureGenuineness.model.js';
import { ApiError } from '../../../../utils/ApiError.js';
import {
    actorUserId,
    actorUserName,
    assertCanDeleteRunData,
    isDataExtractorAdmin,
    isPausedExtractionSession,
} from './simpleLeadSearch.ownership.util.js';
import { ownerStopPersistentRun } from './simpleLeadSearch.autoCollection.service.js';

function requireCompanyId(companyId) {
    if (!companyId) throw new ApiError(400, 'Company context required');
    return companyId;
}

async function deleteManySafe(model, filter) {
    try {
        const res = await model.deleteMany(filter);
        return Number(res?.deletedCount || 0);
    } catch {
        return 0;
    }
}

export async function deleteSimpleLeadSearchRunData({
    companyId,
    user,
    sessionId,
    confirmText = '',
    deletionReason = '',
    downloadedConfirmed = false,
}) {
    const cid = requireCompanyId(companyId);
    if (String(confirmText || '').trim().toUpperCase() !== 'DELETE') {
        throw new ApiError(400, 'Type DELETE to confirm permanent removal of extracted data.');
    }

    const session = await AssistedCaptureSession.findOne({ _id: sessionId, companyId: cid }).lean();
    if (!session) throw new ApiError(404, 'Assisted capture session not found');
    if (session.dataRetentionStatus === 'DATA_DELETED') {
        return {
            alreadyDeleted: true,
            sessionId: String(session._id),
            campaignId: session.campaignId ? String(session.campaignId) : null,
            status: 'DATA_DELETED',
            deleted: {},
        };
    }
    assertCanDeleteRunData(user, session);

    if (isPausedExtractionSession(session)) {
        await ownerStopPersistentRun({
            companyId: cid,
            user,
            sessionId: String(session._id),
            reason: 'delete_run_data',
        });
    }

    const campaign = session.campaignId
        ? await SearchCampaign.findOne({ _id: session.campaignId, companyId: cid }).lean()
        : null;
    const archiveStatus = campaign?.s3Archive?.status || 'NOT_ARCHIVED';
    if (archiveStatus === 'ARCHIVING') {
        throw new ApiError(409, 'Archive is still in progress. Wait until status is VERIFIED before deleting Mongo data.');
    }
    if (archiveStatus !== 'VERIFIED' && !downloadedConfirmed) {
        throw new ApiError(
            400,
            'Download or archive the results first. Browser download cannot be verified after it leaves the server — confirm downloadedConfirmed=true only after you have the file.',
        );
    }

    const campaignId = session.campaignId;
    const siblingOwners = campaignId
        ? await AssistedCaptureSession.distinct('createdBy', {
            companyId: cid,
            campaignId,
            _id: { $ne: session._id },
        })
        : [];
    const campaignExclusive = siblingOwners.every((id) => !id || String(id) === String(session.createdBy));
    const canDeleteCampaignWide = campaignExclusive && (
        isDataExtractorAdmin(user) || String(campaign?.createdBy || session.createdBy) === String(actorUserId(user))
    );

    const originalRecordCount = campaignId
        ? await RawCapture.countDocuments({ companyId: cid, campaignId })
        : 0;

    const deleted = {};
    const sessionFilter = { companyId: cid, sessionId: session._id };
    const campaignFilter = campaignId ? { companyId: cid, campaignId } : null;

    deleted.rawCaptureEnrichments = await deleteManySafe(RawCaptureEnrichment, sessionFilter);
    deleted.rawCaptureEnrichmentJobs = await deleteManySafe(RawCaptureEnrichmentJob, sessionFilter);
    deleted.rawCaptureQualifications = await deleteManySafe(RawCaptureQualification, sessionFilter);
    deleted.rawCaptureQualificationJobs = await deleteManySafe(RawCaptureQualificationJob, sessionFilter);
    deleted.rawCaptureLocationRecheckJobs = await deleteManySafe(RawCaptureLocationRecheckJob, sessionFilter);
    deleted.rawCaptureGenuineness = await deleteManySafe(RawCaptureGenuineness, sessionFilter);
    deleted.rawCaptureGenuinenessJobs = await deleteManySafe(RawCaptureGenuinenessJob, sessionFilter);
    deleted.assistedCaptureEvents = await deleteManySafe(AssistedCaptureEvent, { companyId: cid, sessionId: session._id });

    if (canDeleteCampaignWide && campaignFilter) {
        const crmLinked = await RawCapture.find({
            ...campaignFilter,
            $or: [
                { crmLeadId: { $ne: null } },
                { crmCustomerId: { $ne: null } },
                { promotedExtractedLeadId: { $ne: null } },
            ],
        }).select('_id').lean();
        const keepIds = crmLinked.map((r) => r._id);
        const heavyFilter = keepIds.length
            ? { ...campaignFilter, _id: { $nin: keepIds } }
            : campaignFilter;
        deleted.rawCaptures = await deleteManySafe(RawCapture, heavyFilter);
        deleted.rawCaptureBatches = await deleteManySafe(RawCaptureBatch, campaignFilter);
        deleted.rawCaptureImportRuns = await deleteManySafe(RawCaptureImportRun, campaignFilter);
        deleted.rawCapturesKeptForCrm = keepIds.length;
    } else {
        deleted.rawCaptures = 0;
        deleted.rawCapturesSkippedSharedCampaign = true;
    }

    const now = new Date();
    const deletedBy = actorUserId(user);
    const deletedByName = actorUserName(user);
    const tombstone = {
        dataRetentionStatus: 'DATA_DELETED',
        dataDeletedAt: now,
        dataDeletedBy: deletedBy,
        dataDeletedByName: deletedByName,
        originalRecordCount,
        deletionReason: String(deletionReason || '').trim().slice(0, 300),
        exportConfirmed: Boolean(downloadedConfirmed),
        archiveStatusAtDelete: archiveStatus,
    };

    await AssistedCaptureSession.updateOne(
        { _id: session._id, companyId: cid },
        {
            $set: {
                ...tombstone,
                status: session.status === 'capturing' || session.status === 'queued' ? 'cancelled' : session.status,
            },
        },
    );

    if (canDeleteCampaignWide && campaignId) {
        await SearchCampaign.updateOne(
            { _id: campaignId, companyId: cid },
            {
                $set: {
                    dataRetentionStatus: 'DATA_DELETED',
                    dataDeletedAt: now,
                    dataDeletedBy: deletedBy,
                    dataDeletedByName: deletedByName,
                    originalRecordCount,
                    deletionReason: tombstone.deletionReason,
                },
            },
        );
        await SearchQuery.updateMany(
            { companyId: cid, campaignId },
            { $set: { slsCaptureStatus: 'archived' } },
        );
    }

    return {
        alreadyDeleted: false,
        sessionId: String(session._id),
        campaignId: campaignId ? String(campaignId) : null,
        status: 'DATA_DELETED',
        originalRecordCount,
        archiveStatus,
        deleted,
        crmLeadCustomerPreserved: true,
        tombstone: {
            runId: String(session._id),
            campaignId: campaignId ? String(campaignId) : null,
            ownerUserId: session.createdBy ? String(session.createdBy) : null,
            ownerName: session.createdByName || '',
            deletedAt: now,
            deletedByName,
        },
    };
}
