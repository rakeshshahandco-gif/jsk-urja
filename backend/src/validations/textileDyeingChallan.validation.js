import Joi from 'joi';
import { TEXTILE_JOB_WORK_PROCESS_TYPES } from '../constants/textileJobWorkChallan.constants.js';

const lineSchema = Joi.object({
    lotNo: Joi.string().allow('').optional(),
    thanNo: Joi.string().allow('').optional(),
    fabricItemId: Joi.string().required(),
    fabricType: Joi.string().allow('').optional(),
    colourInstructionType: Joi.string().valid('FIXED_COLOUR', 'DYER_CHOICE', 'AS_PER_SAMPLE', 'AS_PER_EXPERTISE').optional(),
    colourName: Joi.string().allow('').optional(),
    designPattern: Joi.string().allow('').optional(),
    issuedQty: Joi.number().min(0).optional(),
    issuedUom: Joi.string().allow('').optional(),
    issuedMeter: Joi.number().min(0.0001).optional(),
    meterPerPcs: Joi.number().min(0).optional(),
    pcsRoundMode: Joi.string().valid('ROUND_DOWN', 'ROUND_NEAREST', 'DECIMAL').optional(),
    expectedLossPercent: Joi.number().min(0).max(100).optional(),
    labourProcessName: Joi.string().allow('').optional(),
    labourRateType: Joi.string().valid('PER_METER', 'PER_PCS', 'PER_THAN', 'FIXED_AMOUNT', '').optional(),
    labourRate: Joi.number().min(0).optional(),
    expectedOutputItemId: Joi.string().allow('', null).optional(),
    expectedOutputItemName: Joi.string().allow('').optional(),
    expectedOutputUom: Joi.string().allow('').optional(),
    remarks: Joi.string().allow('').optional(),
    sourceOutputStockId: Joi.string().allow('', null).optional(),
    sourceType: Joi.string().valid('PREVIOUS_PROCESS_OUTPUT', 'DIRECT_STOCK').optional(),
}).or('issuedMeter', 'issuedQty');

const returnLineSchema = Joi.object({
    challanLineId: Joi.string().required(),
    colourName: Joi.string().allow('').optional(),
    returnedQty: Joi.number().min(0.0001).required(),
    returnUom: Joi.string().allow('').optional(),
    creditedMeter: Joi.number().min(0).optional(),
    equivalentMeter: Joi.number().min(0).optional(),
    outputItemId: Joi.string().allow('', null).optional(),
    outputItemName: Joi.string().allow('').optional(),
    remarks: Joi.string().allow('').optional(),
});

export default {
    list: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            status: Joi.string().optional(),
            dyerName: Joi.string().optional(),
            search: Joi.string().optional(),
            pendingOnly: Joi.string().valid('true', 'false').optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
        }),
    },
    create: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
            challanNo: Joi.string().allow('').optional(),
            issueDate: Joi.date().optional(),
            dyerName: Joi.string().required(),
            labourProcessName: Joi.string().allow('').optional(),
            expectedReturnDate: Joi.date().allow(null, '').optional(),
            remarks: Joi.string().allow('').optional(),
            lines: Joi.array().items(lineSchema).min(1).required(),
        }),
    },
    returnEntry: {
        body: Joi.object({
            companyId: Joi.string().optional(),
            returnDate: Joi.date().optional(),
            scanBarcode: Joi.string().allow('').optional(),
            remarks: Joi.string().allow('').optional(),
            nextAction: Joi.string().valid('KEEP_OUTPUT_STOCK', 'SEND_TO_NEXT_PROCESS', 'FINISHED_GOODS').optional(),
            lines: Joi.array().items(returnLineSchema).min(1).required(),
        }),
    },
    lookup: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            barcode: Joi.string().required(),
        }),
    },
    reportQuery: {
        query: Joi.object({
            companyId: Joi.string().optional(),
            fromDate: Joi.date().optional(),
            toDate: Joi.date().optional(),
            processType: Joi.string().valid(...TEXTILE_JOB_WORK_PROCESS_TYPES).optional(),
        }),
    },
};
