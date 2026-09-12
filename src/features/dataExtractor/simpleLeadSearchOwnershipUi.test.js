import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isDataExtractorAdminUser,
    isLiveRunStatus,
    canShowDeleteData,
    includeDeletedQueryValue,
    resolveStartNewDecision,
    formatOwnerBanner,
    formatExtractionDeviceLine,
    formatRegisterPcStatus,
    deleteConfirmMessage,
} from './simpleLeadSearchOwnershipUi.js';

describe('Simple Lead Search ownership UI', () => {
    it('formats Discovery Agent Ready / Offline for Register this PC', () => {
        assert.equal(formatRegisterPcStatus({ online: false }), 'Offline');
        assert.equal(formatRegisterPcStatus({ online: true, deviceName: 'JATIN-PC' }), 'Ready — JATIN-PC');
    });

    it('treats admin roles as All Searches capable', () => {
        assert.equal(isDataExtractorAdminUser({ roleName: 'admin' }), true);
        assert.equal(isDataExtractorAdminUser({ roleName: 'staff' }), false);
        assert.equal(isDataExtractorAdminUser({ roleName: 'staff' }, (r) => r === 'admin'), true);
    });

    it('Start New stays on a live run until the user confirms', () => {
        assert.equal(resolveStartNewDecision({ hasOpenRun: true, runIsLive: true }), 'CONFIRM_LIVE');
        assert.equal(resolveStartNewDecision({ hasOpenRun: true, runIsLive: false }), 'CLEAN_WORKSPACE');
        assert.equal(resolveStartNewDecision({ hasOpenRun: false, runIsLive: false }), 'CLEAN_WORKSPACE');
    });

    it('shows Owner banner when admin opens another user run', () => {
        const banner = formatOwnerBanner({ createdByName: 'Jatin Thakker', createdBy: 'u-jatin' }, 'u-admin');
        assert.equal(banner.label, 'Owner: Jatin Thakker');
        assert.equal(banner.monitoring, true);
        const withDevice = formatOwnerBanner({
            createdByName: 'Jatin Thakker',
            createdBy: 'u-jatin',
            assignedDeviceName: 'JATIN-PC',
        }, 'u-admin');
        assert.equal(withDevice.deviceLine, 'Extraction Device: JATIN-PC');
        assert.equal(formatExtractionDeviceLine({ assignedDeviceName: 'JATIN-PC' }), 'Extraction Device: JATIN-PC');
    });

    it('does not treat DATA_DELETED as live', () => {
        assert.equal(isLiveRunStatus({ status: 'RUNNING', dataRetentionStatus: 'DATA_DELETED' }), false);
        assert.equal(isLiveRunStatus({ status: 'RUNNING' }), true);
        assert.equal(isLiveRunStatus({ status: 'CANCELLED', autoCollectionStatus: 'running' }), false);
    });

    it('shows Delete Data only on eligible finished runs', () => {
        assert.equal(canShowDeleteData({ status: 'CANCELLED' }), true);
        assert.equal(canShowDeleteData({ status: 'COMPLETED' }), true);
        assert.equal(canShowDeleteData({ status: 'PAUSED' }), true);
        assert.equal(canShowDeleteData({ status: 'RUNNING' }), false);
        assert.equal(canShowDeleteData({ status: 'PROCESSING' }), false);
        assert.equal(canShowDeleteData({ status: 'RETRYING' }), false);
        assert.equal(canShowDeleteData({ status: 'CANCELLED', dataRetentionStatus: 'DATA_DELETED' }), false);
    });

    it('uses a stronger warning when deleting a paused run', () => {
        const msg = deleteConfirmMessage({ status: 'PAUSED', campaignName: 'LED', city: 'Vadodara' });
        assert.equal(msg.title, 'Delete Paused Extraction?');
        assert.match(msg.warning, /permanently end this run/i);
        assert.equal(msg.paused, true);
        assert.equal(msg.confirmWord, 'DELETE');
    });

    it('sends includeDeleted only when Show Deleted is on', () => {
        assert.equal(includeDeletedQueryValue(false), false);
        assert.equal(includeDeletedQueryValue(true), true);
    });

    it('requires typed DELETE confirmation copy', () => {
        const msg = deleteConfirmMessage({
            campaignName: 'LED Vadodara',
            createdByName: 'Jatin Thakker',
            resultCount: 160,
            city: 'Vadodara',
            state: 'Gujarat',
        });
        assert.equal(msg.title, 'Delete Extracted Data?');
        assert.match(msg.warning, /small audit record will be retained/i);
        assert.equal(msg.confirmWord, 'DELETE');
        assert.equal(msg.searchName, 'LED Vadodara');
        assert.equal(msg.location, 'Vadodara, Gujarat');
        assert.equal(msg.user, 'Jatin Thakker');
    });
});
