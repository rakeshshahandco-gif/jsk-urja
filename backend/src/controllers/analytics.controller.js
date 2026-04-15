import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import analyticsService from '../services/analytics.service.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const getSalesMarketingAnalytics = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['fromDate', 'toDate', 'salesperson', 'source', 'product', 'fy']);
    const analytics = await analyticsService.getSalesMarketingAnalytics(filters, req.user);
    res.send(new ApiResponse(200, analytics, 'Sales and marketing analytics fetched successfully'));
});

const queryLeadReport = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['fromDate', 'toDate', 'salesperson', 'source', 'product', 'stage']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    const result = await analyticsService.queryLeadReport(filters, options);
    res.send(new ApiResponse(200, result, 'Lead report fetched successfully'));
});

const exportSalesMarketingAnalytics = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['fromDate', 'toDate', 'salesperson', 'source', 'product']);
    const buffer = await analyticsService.exportSalesMarketingAnalytics(filters);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=SalesMarketingMIS_${new Date().getTime()}.xlsx`);
    res.send(buffer);
});

export default {
    getSalesMarketingAnalytics,
    queryLeadReport,
    exportSalesMarketingAnalytics,
};
