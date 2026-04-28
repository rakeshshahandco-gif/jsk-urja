import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as backupService from '../services/backup.service.js';

export const triggerBackup = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const backup = await backupService.generateBackup(req.user.id, reason);
    res.status(httpStatus.CREATED).json({
        success: true,
        message: 'Backup generated successfully',
        data: backup
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
    res.json({
        success: true,
        message: 'System restored successfully',
        data: result
    });
});
