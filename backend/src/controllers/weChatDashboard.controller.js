import httpStatus from 'http-status';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatSample } from '../models/weChatSample.model.js';
import { Task } from '../models/task.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getDashboardStats = asyncHandler(async (req, res) => {
    const [totalProducts, totalContacts, totalGroups, pendingSamples, followUpsDue] = await Promise.all([
        WeChatProduct.countDocuments(),
        WeChatContact.countDocuments(),
        WeChatGroup.countDocuments(),
        WeChatSample.countDocuments({ testingStatus: { $in: ['Pending', 'Under Testing'] } }),
        Task.countDocuments({ status: 'OPEN', description: /WeChat Follow-up/ })
    ]);

    res.send(new ApiResponse(httpStatus.OK, {
        totalProducts,
        totalContacts,
        totalGroups,
        pendingSamples,
        followUpsDue
    }));
});
