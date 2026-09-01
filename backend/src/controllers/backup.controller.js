import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as backupService from '../services/backup.service.js';

export const triggerBackup = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const job = backupService.startBackupJob(req.user.id, reason);
    res.status(httpStatus.ACCEPTED).json({
        success: true,
        message: 'Backup is running in background. You can continue using CRM.',
        data: job,
    });
});

export const getBackupJob = asyncHandler(async (req, res) => {
    const job = backupService.getBackupJob(req.params.id);
    res.json({
        success: true,
        data: job,
    });
});

export const getBackups = asyncHandler(async (req, res) => {
    const backups = await backupService.listBackups();
    res.json({
        success: true,
        data: backups
    });
});

export const downloadBackup = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const filePath = backupService.getBackupFilePath(id);
    res.download(filePath);
});

export const restoreFromBackup = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await backupService.restoreBackup(id, req.user.id);
    res.status(httpStatus.OK).json({
        success: true,
        message: result?.message || 'Database restoration completed successfully',
        backupId: result?.backupId || id,
        targetDatabase: result?.targetDatabase,
        backupSourceDatabase: result?.backupSourceDatabase,
        data: result,
    });
});

export const uploadBackup = asyncHandler(async (req, res) => {
    const backup = await backupService.processUploadedBackup(req.file, req.user.id);
    res.json({
        success: true,
        message: 'Backup uploaded and indexed successfully',
        data: backup
    });
});

export const deleteBackup = asyncHandler(async (req, res) => {
    const result = backupService.deleteBackup(req.params.id);
    res.json({
        success: true,
        message: result.message,
        data: result,
    });
});
