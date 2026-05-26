import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import httpStatus from 'http-status';
import { TdsChallan } from '../models/tdsChallan.model.js';
import { Supplier } from '../models/supplier.model.js';
import { Company } from '../models/company.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import { ApiError } from '../utils/ApiError.js';
import { numberToWords } from '../utils/numberToWords.js';
import {
    assessmentYearFromFinancialYear,
    normalizePan,
    isIndividualHufConstitution,
} from '../constants/tds.constants.js';
import * as tdsChallanService from './tdsChallan.service.js';

const COMPANY_CONSTITUTIONS = new Set([
    'Private Limited Company',
    'Public Limited Company',
    'LLP',
]);

/** ITNS 281 nature-of-payment grid keys */
export const ITNS281_NATURE_OPTIONS = [
    { key: '94C', label: '94C Contractor / Sub-Contractor', section: '194C' },
    { key: '94J', label: '94J Professional / Technical Fees', section: '194J' },
    { key: '94H', label: '94H Commission / Brokerage', section: '194H' },
    { key: '94I', label: '94I Rent', section: '194I' },
    { key: '94A', label: '94A Interest other than securities', section: '194A' },
    { key: '195', label: '195 Payment to Non-Resident', section: '195' },
];

const SECTION_TO_NATURE = {
    '194C': '94C',
    '194J': '94J',
    '194H': '94H',
    '194I': '94I',
    '194IB': '94I',
    '194A': '94A',
    '195': '195',
};

function normalizeSectionCode(section) {
    return String(section || '').trim().toUpperCase();
}

function natureKeyForSection(section) {
    const sec = normalizeSectionCode(section);
    return SECTION_TO_NATURE[sec] || '';
}

function bucketFromPan(pan) {
    const p = normalizePan(pan);
    if (p.length < 4) return null;
    const ch = p[3];
    if (ch === 'C') return '0020';
    return '0021';
}

function bucketFromConstitution(constitution) {
    const c = String(constitution || '').trim();
    if (!c) return null;
    if (COMPANY_CONSTITUTIONS.has(c)) return '0020';
    if (isIndividualHufConstitution(c)) return '0021';
    if (c === 'Partnership Firm' || c === 'Trust' || c === 'Society' || c === 'Others' || c === 'Proprietorship') {
        return '0021';
    }
    return '0021';
}

function classifyDeducteeBucket({ pan, constitution }) {
    return bucketFromConstitution(constitution) || bucketFromPan(pan) || '0021';
}

async function loadDeductor(companyId) {
    const company = companyId ? await Company.findById(companyId).lean() : null;
    let profile = null;
    if (companyId) {
        profile = await CompanyProfile.findOne({ companyId }).lean();
    }
    const tan = String(company?.tanNumber || profile?.tanNumber || '').trim().toUpperCase();
    return {
        company,
        profile,
        deductor: {
            tan,
            fullName:
                company?.legalName ||
                company?.companyName ||
                profile?.companyName ||
                '',
            address: company?.address || profile?.address || '',
            city: company?.city || profile?.city || '',
            state: company?.state || profile?.state || '',
            pinCode: company?.pincode || profile?.pincode || '',
            telephone: company?.mobile || profile?.phone || '',
            pan: company?.panNumber || profile?.panNumber || '',
        },
    };
}

async function enrichLineItemsWithDeducteeBuckets(lineItems) {
    const pans = [
        ...new Set(
            lineItems
                .map((li) => normalizePan(li.deducteePan))
                .filter((p) => p.length >= 10),
        ),
    ];
    const byPan = new Map();
    if (pans.length) {
        const suppliers = await Supplier.find({ panNumber: { $in: pans } })
            .select('panNumber deducteeConstitution supplierName')
            .lean();
        for (const s of suppliers) {
            byPan.set(normalizePan(s.panNumber), s);
        }
    }
    return lineItems.map((li) => {
        const pan = normalizePan(li.deducteePan);
        const sup = pan ? byPan.get(pan) : null;
        const bucket = classifyDeducteeBucket({
            pan,
            constitution: sup?.deducteeConstitution,
        });
        return { ...li, deducteeBucket: bucket };
    });
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function validateLineItemsAndBuildAmounts(lineItems, paymentOverrides = {}, challanMeta = {}) {
    if (!lineItems?.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one TDS challan/payment record');
    }

    const sections = new Set();
    const buckets = new Set();
    let basicTds = 0;

    for (const li of lineItems) {
        const sec = normalizeSectionCode(li.section);
        if (sec) sections.add(sec);
        buckets.add(li.deducteeBucket || '0021');
        basicTds += round2(li.payAmount);
    }

    if (sections.size > 1) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Separate challan is required for each Nature / Type of Payment.',
        );
    }
    if (buckets.size > 1) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Separate challan is required for Company and Non-Company deductees.',
        );
    }

    const soleSection = [...sections][0] || '';
    const natureKey = natureKeyForSection(soleSection);
    if (soleSection && !natureKey) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Section ${soleSection} is not supported on ITNS 281 bank challan. Use sections 194C, 194J, 194H, 194I, 194A, or 195.`,
        );
    }

    if (basicTds <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Amount must be greater than zero');
    }

    const surcharge = round2(paymentOverrides.surcharge ?? challanMeta.surcharge ?? 0);
    const educationCess = round2(
        paymentOverrides.educationCess ?? paymentOverrides.cess ?? challanMeta.educationCess ?? 0,
    );
    const interest = round2(paymentOverrides.interest ?? challanMeta.interest ?? 0);
    const penalty = round2(
        paymentOverrides.penalty ??
            (Number(challanMeta.penalty || 0) + Number(challanMeta.lateFee || 0)) ??
            0,
    );
    const total = round2(basicTds + surcharge + educationCess + interest + penalty);

    return {
        taxApplicable: [...buckets][0] || '0021',
        section: soleSection,
        natureKey,
        paymentBreakup: {
            incomeTax: basicTds,
            surcharge,
            educationCess,
            interest,
            penalty,
            total,
            totalInWords: numberToWords(total),
        },
    };
}

export async function buildItns281FromChallan(challanId, companyId, headerFinancialYear, body = {}) {
    const ch = await tdsChallanService.getChallanDetail(challanId);
    if (String(ch.status || '').toLowerCase() === 'cancelled') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cancelled challan cannot be used for bank challan');
    }
    const fy = String(ch.financialYear || ch.displayFinancialYear || '').trim();
    const headerFy = String(headerFinancialYear || '').trim();
    if (headerFy && fy && headerFy !== fy) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Financial year must match selected company/FY header');
    }
    const { deductor } = await loadDeductor(companyId);
    if (!deductor.tan) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'TAN is required for Bank Challan ITNS 281. Add TDS No. (TAN) under Settings → Company Profile.',
        );
    }
    const assessmentYear =
        String(ch.assessmentYear || ch.displayAssessmentYear || '').trim() ||
        assessmentYearFromFinancialYear(fy || headerFy);
    if (!assessmentYear) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Assessment Year is required');
    }

    const lineItems = await enrichLineItemsWithDeducteeBuckets(ch.lineItems || []);
    const core = validateLineItemsAndBuildAmounts(lineItems, body.payment || {}, {
        interest: ch.interest,
        penalty: ch.penalty,
        lateFee: ch.lateFee,
    });

    const typeOfPayment = String(body.payment?.typeOfPayment || '200').trim() || '200';

    return formatItns281Context({
        deductor,
        assessmentYear,
        financialYear: fy || headerFy,
        typeOfPayment,
        ...core,
        paymentDetails: buildPaymentDetails(body.payment || {}, ch),
    });
}

export async function buildItns281FromDraft(companyId, body) {
    const headerFy = String(body.financialYear || '').trim();
    if (!headerFy) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'financialYear is required');
    }
    const { deductor } = await loadDeductor(companyId);
    if (!deductor.tan) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'TAN is required for Bank Challan ITNS 281. Add TDS No. (TAN) under Settings → Company Profile.',
        );
    }
    const assessmentYear =
        String(body.assessmentYear || '').trim() || assessmentYearFromFinancialYear(headerFy);
    if (!assessmentYear) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Assessment Year is required');
    }

    const allocations = body.allocations || [];
    if (!allocations.length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one TDS challan/payment record');
    }

    const lineItems = [];
    for (const raw of allocations) {
        if (!mongoose.Types.ObjectId.isValid(raw.id || raw.sourceId)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid allocation id');
        }
        const resolved = await tdsChallanService.resolveLineItemFromAllocation(raw, null);
        lineItems.push(resolved.line);
    }

    const enriched = await enrichLineItemsWithDeducteeBuckets(lineItems);
    const core = validateLineItemsAndBuildAmounts(enriched, body.payment || {}, {
        interest: body.interest,
        penalty: body.penalty,
        lateFee: body.lateFee,
    });

    return formatItns281Context({
        deductor,
        assessmentYear,
        financialYear: headerFy,
        typeOfPayment: String(body.payment?.typeOfPayment || '200').trim() || '200',
        ...core,
        paymentDetails: buildPaymentDetails(body.payment || {}, body),
    });
}

function buildPaymentDetails(overrides, source) {
    const mode = String(overrides.paidMode || source.paymentMode || '').trim();
    const bankName = String(overrides.drawnOnBank || source.bankName || '').trim();
    return {
        paidInCashOrCheque: overrides.paidInCashOrCheque || mode || '',
        chequeNo: overrides.chequeNo || '',
        chequeDate: overrides.chequeDate || '',
        drawnOnBank: bankName,
        paymentDate: overrides.paymentDate || source.challanDate || new Date(),
        signatureNote: overrides.signatureNote || '',
    };
}

function formatItns281Context({
    deductor,
    assessmentYear,
    financialYear,
    taxApplicable,
    typeOfPayment,
    section,
    natureKey,
    paymentBreakup,
    paymentDetails,
}) {
    const natureTicks = {};
    for (const opt of ITNS281_NATURE_OPTIONS) {
        natureTicks[opt.key] = opt.key === natureKey;
    }
    return {
        formTitle: 'T.D.S. / T.C.S. TAX CHALLAN',
        formCode: 'ITNS 281',
        ruleRef: 'See Rule 31A',
        copyNote: 'Single Copy to be sent to ZAO',
        usageNote: 'To be used for TDS / TCS payment under Income Tax Act, 1961',
        challanNoLabel: 'Challan No. ITNS 281',
        taxApplicable: {
            company: taxApplicable === '0020',
            nonCompany: taxApplicable === '0021',
        },
        deductor: {
            assessmentYear,
            tan: deductor.tan,
            fullName: deductor.fullName,
            address: deductor.address,
            city: deductor.city,
            state: deductor.state,
            pinCode: deductor.pinCode,
            telephone: deductor.telephone,
        },
        financialYear,
        typeOfPayment: {
            code200: typeOfPayment === '200' || !typeOfPayment,
            code400: typeOfPayment === '400',
        },
        natureOfPayment: natureTicks,
        natureOptions: ITNS281_NATURE_OPTIONS,
        section,
        paymentBreakup,
        paymentDetails: {
            ...paymentDetails,
            paymentDateFormatted: paymentDetails.paymentDate
                ? new Date(paymentDetails.paymentDate).toLocaleDateString('en-IN')
                : '',
            chequeDateFormatted: paymentDetails.chequeDate
                ? new Date(paymentDetails.chequeDate).toLocaleDateString('en-IN')
                : '',
        },
        bankUseOnly: true,
        footerNotes: [
            'Separate Challan should be used for each Nature / Type of Payment.',
            'Please quote TAN in all communications.',
        ],
        chequeFavourNote: 'Cheque / DD should be drawn in favour of __________ Bank A/c Income-tax',
    };
}

function drawTick(doc, x, y, checked, size = 8) {
    doc.rect(x, y, size, size).stroke();
    if (checked) {
        doc.fontSize(7).text('✓', x + 1, y - 1);
    }
}

export function renderItns281Pdf(ctx, doc) {
    const margin = 36;
    let y = margin;
    const pageW = doc.page.width - margin * 2;

    doc.fontSize(11).font('Helvetica-Bold').text(ctx.formTitle, margin, y, { width: pageW, align: 'center' });
    y += 14;
    doc.fontSize(12).text(ctx.formCode, margin, y, { width: pageW, align: 'center' });
    y += 12;
    doc.fontSize(7).font('Helvetica');
    doc.text(ctx.ruleRef, margin, y, { width: pageW, align: 'center' });
    y += 8;
    doc.text(ctx.copyNote, margin, y, { width: pageW, align: 'center' });
    y += 8;
    doc.text(ctx.usageNote, margin, y, { width: pageW, align: 'center' });
    y += 8;
    doc.text(ctx.challanNoLabel, margin, y, { width: pageW, align: 'center' });
    y += 14;

    doc.font('Helvetica-Bold').fontSize(8).text('1. TAX APPLICABLE', margin, y);
    y += 10;
    drawTick(doc, margin, y, ctx.taxApplicable.company);
    doc.font('Helvetica').text('0020 Company Deductees', margin + 12, y + 1);
    drawTick(doc, margin + 200, y, ctx.taxApplicable.nonCompany);
    doc.text('0021 Non-Company Deductees', margin + 212, y + 1);
    y += 16;

    doc.font('Helvetica-Bold').text('2. Deductor Details', margin, y);
    y += 10;
    const d = ctx.deductor;
    const rows = [
        ['Assessment Year', d.assessmentYear],
        ['TAN', d.tan],
        ['Full Name', d.fullName],
        ['Complete Address', d.address],
        ['City', d.city, 'State', d.state],
        ['PIN Code', d.pinCode, 'Telephone No.', d.telephone],
    ];
    doc.font('Helvetica').fontSize(7);
    for (const row of rows) {
        if (row.length === 2) {
            doc.text(`${row[0]}: ${row[1] || ''}`, margin, y, { width: pageW });
            y += 10;
        } else {
            doc.text(`${row[0]}: ${row[1] || ''}    ${row[2]}: ${row[3] || ''}`, margin, y, { width: pageW });
            y += 10;
        }
    }
    y += 4;

    doc.font('Helvetica-Bold').text('3. TYPE OF PAYMENT', margin, y);
    y += 10;
    drawTick(doc, margin, y, ctx.typeOfPayment.code200);
    doc.font('Helvetica').text('200 TDS / TCS Payable by Taxpayer', margin + 12, y + 1);
    drawTick(doc, margin + 200, y, ctx.typeOfPayment.code400);
    doc.text('400 TDS / TCS Regular Assessment', margin + 212, y + 1);
    y += 14;

    doc.font('Helvetica-Bold').text('4. NATURE OF PAYMENT', margin, y);
    y += 8;
    let col = 0;
    for (const opt of ITNS281_NATURE_OPTIONS) {
        const cx = margin + col * (pageW / 2);
        drawTick(doc, cx, y, !!ctx.natureOfPayment[opt.key]);
        doc.font('Helvetica').fontSize(6).text(opt.label, cx + 10, y, { width: pageW / 2 - 14 });
        col += 1;
        if (col >= 2) {
            col = 0;
            y += 18;
        }
    }
    if (col) y += 18;

    doc.font('Helvetica-Bold').fontSize(8).text('5. DETAILS OF PAYMENT', margin, y);
    y += 10;
    const pb = ctx.paymentBreakup;
    const payRows = [
        ['1. Income Tax / Basic TDS', pb.incomeTax],
        ['2. Surcharge', pb.surcharge],
        ['3. Education Cess / Health & Education Cess', pb.educationCess],
        ['4. Interest', pb.interest],
        ['5. Penalty', pb.penalty],
        ['6. TOTAL', pb.total],
    ];
    doc.font('Helvetica').fontSize(7);
    for (const [label, amt] of payRows) {
        doc.text(label, margin, y, { width: pageW * 0.7 });
        doc.text(`₹ ${Number(amt).toFixed(2)}`, margin + pageW * 0.72, y, { width: pageW * 0.28, align: 'right' });
        y += 10;
    }
    doc.text(`Amount in words: ${pb.totalInWords}`, margin, y, { width: pageW });
    y += 14;

    doc.font('Helvetica-Bold').text('6. PAYMENT DETAILS', margin, y);
    y += 10;
    const pd = ctx.paymentDetails;
    doc.font('Helvetica').fontSize(7);
    doc.text(`Paid in Cash / Debit to A/c / Cheque No.: ${pd.paidInCashOrCheque || ''}`, margin, y);
    y += 9;
    doc.text(`Cheque Date: ${pd.chequeDateFormatted || ''}    Drawn on Bank & Branch: ${pd.drawnOnBank || ''}`, margin, y);
    y += 9;
    doc.text(`Date: ${pd.paymentDateFormatted || ''}`, margin, y);
    y += 9;
    doc.text('Signature of person making payment: _________________________', margin, y);
    y += 10;
    doc.fontSize(6).text(ctx.chequeFavourNote, margin, y);
    y += 14;

    doc.font('Helvetica-Bold').fontSize(8).text('7. FOR RECEIVING BANK USE ONLY', margin, y);
    y += 10;
    doc.font('Helvetica').fontSize(7);
    doc.text('Debit to A/c / Cheque credited on: _______________', margin, y);
    y += 12;
    doc.text('Bank Seal: _______________    7 Digit BSR Code: _______________', margin, y);
    y += 12;
    doc.text('Date of Deposit: _______________    Challan Serial Number: _______________', margin, y);
    y += 14;
    doc.fontSize(6);
    ctx.footerNotes.forEach((note, i) => {
        doc.text(`${i + 1}. ${note}`, margin, y);
        y += 8;
    });
}

export function createItns281PdfBuffer(ctx) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 36, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        renderItns281Pdf(ctx, doc);
        doc.end();
    });
}
