import Joi from 'joi';
import { SUPPLIER_DOCUMENT_TYPES } from '../constants/supplierKyc.constants.js';

const objectId = Joi.string().hex().length(24);

const listBySupplier = {
    params: Joi.object({
        supplierId: objectId.required(),
    }),
    query: Joi.object({
        documentType: Joi.string().valid(...SUPPLIER_DOCUMENT_TYPES).optional(),
    }),
};

const documentIdParams = {
    params: Joi.object({
        documentId: objectId.required(),
    }),
};

const uploadBody = {
    params: Joi.object({
        supplierId: objectId.required(),
    }),
    body: Joi.object({
        documentType: Joi.string().valid(...SUPPLIER_DOCUMENT_TYPES).required(),
        documentNumber: Joi.string().allow('').optional(),
        expiryDate: Joi.date().optional().allow(null, ''),
        reminderDays: Joi.number().integer().min(0).optional().allow(null, ''),
        source: Joi.string().valid('upload', 'scan', 'mobile_scan', 'replace').optional(),
        scanMode: Joi.string().optional(),
        companyId: objectId.optional().allow(null, ''),
        financialYearId: objectId.optional().allow(null, ''),
        groupId: Joi.string().allow('').optional(),
    }),
};

const replaceBody = {
    ...documentIdParams,
    body: Joi.object({
        documentNumber: Joi.string().allow('').optional(),
        expiryDate: Joi.date().optional().allow(null, ''),
        reminderDays: Joi.number().integer().min(0).optional().allow(null, ''),
        source: Joi.string().valid('upload', 'scan', 'mobile_scan', 'replace').optional(),
    }),
};

const updateMetaBody = {
    ...documentIdParams,
    body: Joi.object({
        documentNumber: Joi.string().allow('').optional(),
        expiryDate: Joi.date().optional().allow(null, ''),
        reminderDays: Joi.number().integer().min(0).optional().allow(null, ''),
    }),
};

const missingType = {
    params: Joi.object({
        documentType: Joi.string().valid(...SUPPLIER_DOCUMENT_TYPES).required(),
    }),
    query: Joi.object({
        limit: Joi.number().integer().min(1).max(2000).optional(),
        companyId: objectId.optional(),
    }),
};

export default {
    listBySupplier,
    getDocument: documentIdParams,
    upload: uploadBody,
    replace: replaceBody,
    updateMeta: updateMetaBody,
    remove: documentIdParams,
    missingType,
    missingKyc: { query: Joi.object({ limit: Joi.number().integer().optional() }) },
    expiring: {
        query: Joi.object({
            withinDays: Joi.number().integer().min(1).max(365).optional(),
            limit: Joi.number().integer().optional(),
        }),
    },
};
