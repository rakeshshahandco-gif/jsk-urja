import httpStatus from 'http-status';
import { PERMISSION_REGISTRY } from '../config/permissionRegistry.js';
import { catchAsync } from '../utils/catchAsync.js';

export const getPermissionMetadata = catchAsync(async (req, res) => {
    res.status(httpStatus.OK).json({
        success: true,
        data: PERMISSION_REGISTRY
    });
});
