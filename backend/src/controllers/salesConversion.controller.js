/**
 * salesConversion.controller.js
 * 
 * Controller handlers for the Sales Conversion Analysis Dashboard.
 * All routes are GET-only — read-only analytics, no data mutations.
 */
import pick from '../utils/pick.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as svc from '../services/salesConversion.service.js';

const catchAsync = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const FILTER_FIELDS = ['fromDate', 'toDate', 'fy', 'salesperson', 'customer', 'item', 'itemGroup', 'source', 'customerType', 'paymentStatus', 'highValueThreshold'];
const PAGE_FIELDS   = ['page', 'limit', 'sortBy'];

// 1. Full Sales Conversion Funnel
export const getSalesConversionFunnel = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getSalesConversionFunnel(filters);
    res.json(new ApiResponse(200, data, 'Sales conversion funnel fetched successfully'));
});

// 2. Sample Conversion Analysis
export const getSampleConversionAnalysis = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getSampleConversionAnalysis(filters);
    res.json(new ApiResponse(200, data, 'Sample conversion analysis fetched successfully'));
});

// 3. Non-Converted Samples (paginated)
export const getNonConvertedSamples = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const options = pick(req.query, PAGE_FIELDS);
    const data = await svc.getNonConvertedSamples(filters, options);
    res.json(new ApiResponse(200, data, 'Non-converted samples fetched successfully'));
});

// 4. Repeat Business Analysis
export const getRepeatBusinessAnalysis = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getRepeatBusinessAnalysis(filters);
    res.json(new ApiResponse(200, data, 'Repeat business analysis fetched successfully'));
});

// 5. Item-Wise Sales Analysis
export const getItemWiseSalesAnalysis = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getItemWiseSalesAnalysis(filters);
    res.json(new ApiResponse(200, data, 'Item-wise sales analysis fetched successfully'));
});

// 6. Customer-Wise Sales Analysis (paginated)
export const getCustomerWiseSalesAnalysis = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const options = pick(req.query, PAGE_FIELDS);
    const data = await svc.getCustomerWiseSalesAnalysis(filters, options);
    res.json(new ApiResponse(200, data, 'Customer-wise sales analysis fetched successfully'));
});

// 7. Salesperson Conversion Matrix
export const getSalespersonConversionMatrix = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getSalespersonConversionMatrix(filters);
    res.json(new ApiResponse(200, data, 'Salesperson conversion matrix fetched successfully'));
});

// 8. Payment Received Analysis
export const getPaymentReceivedAnalysis = catchAsync(async (req, res) => {
    const filters = pick(req.query, FILTER_FIELDS);
    const data = await svc.getPaymentReceivedAnalysis(filters);
    res.json(new ApiResponse(200, data, 'Payment received analysis fetched successfully'));
});
