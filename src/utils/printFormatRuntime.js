/**
 * Runtime helpers for applying saved Print Format layout (no calculation changes).
 *
 * Do not apply Print Format Designer draft layouts to live Sales Invoice print.
 * Use locked built-in invoice format unless a custom format is Approved and Active Default.
 */

import { buildBlockLayoutCss, hasBlockLayout } from './printFormatBlockRuntime.js';

const LIVE_PRINT_FORMAT_STATUS = 'approved';

const SECTION_CLASS_MAP = {
    header: 'p-header',
    companyDetails: 'p-header',
    customerDetails: 'pf-customer-details',
    documentDetails: 'pf-order-details',
    itemTable: 'pf-item-table',
    totalsBox: 'pf-totals-box',
    remarks: 'pf-remarks',
    terms: 'pf-terms',
    bankDetails: 'pf-bank-details',
    signature: 'pf-signature',
};

export function isGoldenBuiltInPrintFormat(printFormat) {
    if (!printFormat) return true;
    // Approved + Active Default is an intentional live override — never treat as golden.
    if (printFormat.isDefault === true && printFormat.status === LIVE_PRINT_FORMAT_STATUS) {
        return false;
    }
    if (printFormat.source === 'original' || printFormat.layout?.source === 'original') return true;
    if (printFormat.layout?.reference?.includes('JSK_INVOICE_A4_LOCKED')) return true;
    if (printFormat.layout?.reference?.includes('JSK_INVOICE_046_LOCKED')) return true;
    return false;
}

/** Only Approved + Active Default custom formats may override live print/PDF. */
export function isLivePrintFormat(printFormat) {
    if (!printFormat) return false;
    if (!printFormat.isDefault) return false;
    if (printFormat.status !== LIVE_PRINT_FORMAT_STATUS) return false;
    if (isGoldenBuiltInPrintFormat(printFormat)) return false;
    return true;
}

export function getPrintFormatDisplayStatus(format) {
    if (!format) return 'Draft';
    if (format.isDefault && format.status === LIVE_PRINT_FORMAT_STATUS) return 'Active Default';
    if (format.status === LIVE_PRINT_FORMAT_STATUS) return 'Approved';
    return 'Draft';
}

export function isPrintSectionVisible(printFormat, section) {
    if (!printFormat?.layout?.sections) return true;
    const cfg = printFormat.layout.sections[section];
    if (!cfg) return true;
    return cfg.visible !== false;
}

export function getPrintContentPadding(printFormat) {
    if (!printFormat?.margins) return '10mm';
    const m = printFormat.margins;
    const unit = m.unit || 'mm';
    return `${m.top ?? 10}${unit} ${m.right ?? 10}${unit} ${m.bottom ?? 10}${unit} ${m.left ?? 10}${unit}`;
}

export function getPrintPageWidthMm(printFormat) {
    if (!printFormat) return 210;
    if (printFormat.paperSize === 'Custom' && printFormat.customPaper?.widthMm) {
        return printFormat.customPaper.widthMm;
    }
    if (printFormat.layout?.pageWidthMm) return printFormat.layout.pageWidthMm;
    return 210;
}

export function getPrintPageSizeRule(printFormat) {
    if (!printFormat) return 'A4 portrait';
    const sizeMap = { A4: 'A4', Letter: 'letter', Legal: 'legal' };
    const paper = sizeMap[printFormat.paperSize] || 'A4';
    const orient = printFormat.orientation === 'landscape' ? 'landscape' : 'portrait';
    return `${paper} ${orient}`;
}

/** Extra @media print CSS when a company Approved + Active Default custom format is live */
export function buildPrintFormatCss(printFormat, rootClass, docType) {
    if (!printFormat) return '';
    // Allow Active Default / approved payloads from /active (already filtered server-side).
    const liveOk = isLivePrintFormat(printFormat)
        || (printFormat.isDefault === true && printFormat.status === LIVE_PRINT_FORMAT_STATUS);
    if (!liveOk) return '';

    const pageW = getPrintPageWidthMm(printFormat);
    const pad = getPrintContentPadding(printFormat);
    const pageSize = getPrintPageSizeRule(printFormat);

    let css = `
      @page { size: ${pageSize}; margin: 0; }
      .${rootClass} {
        width: ${pageW}mm !important;
        min-width: ${pageW}mm !important;
        max-width: ${pageW}mm !important;
        background: #fff !important;
        box-shadow: none !important;
        transform: none !important;
        zoom: 1 !important;
      }
      .${rootClass} .print-content,
      .${rootClass} .print-page {
        width: ${pageW}mm !important;
        max-width: ${pageW}mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        padding: ${pad} !important;
        box-sizing: border-box !important;
        background: #fff !important;
        overflow: hidden !important;
        transform: none !important;
        zoom: 1 !important;
      }
    `;

    if (hasBlockLayout(printFormat) && docType) {
        css += buildBlockLayoutCss(printFormat, rootClass, docType);
    } else {
        const sections = printFormat.layout?.sections || {};
        Object.entries(sections).forEach(([key, cfg]) => {
            if (cfg?.visible === false) {
                css += `.${rootClass} [data-pf-section="${key}"] { display: none !important; }\n`;
            }
        });
    }

    return css;
}

/** Screen-only CSS for Print Format Designer live preview (no @page). */
export function buildPrintFormatScreenCss(printFormat, rootClass, docType) {
    if (!printFormat) return '';

    const pageW = getPrintPageWidthMm(printFormat);
    const pad = getPrintContentPadding(printFormat);

    let css = `
      .${rootClass} {
        width: ${pageW}mm;
        margin: 0 auto;
        background: #fff;
        box-sizing: border-box;
      }
      .${rootClass} .print-page {
        padding: ${pad};
        box-sizing: border-box;
      }
    `;

    if (hasBlockLayout(printFormat) && docType) {
        css += buildBlockLayoutCss(printFormat, rootClass, docType);
    } else {
        const sections = printFormat.layout?.sections || {};
        Object.entries(sections).forEach(([key, cfg]) => {
            if (cfg?.visible === false) {
                css += `.${rootClass} [data-pf-section="${key}"] { display: none !important; }\n`;
            }
        });
    }

    return css;
}

export { hasBlockLayout };

export { SECTION_CLASS_MAP };
