/**
 * Backend PDF: apply saved Print Format page/margin CSS only (layout, not calculations).
 * LOCKED GOLDEN SALES INVOICE FORMAT - built-in flow layout must not receive WYSIWYG block overrides.
 *
 * Do not apply Print Format Designer draft layouts to live Sales Invoice print.
 * Use locked built-in invoice format unless a custom format is Approved and Active Default.
 */

import { GOLDEN_INVOICE_FORMAT_VERSION } from '../constants/goldenInvoiceFormat.constants.js';
import { LIVE_PRINT_FORMAT_STATUS } from '../constants/printFormat.constants.js';

export function isGoldenBuiltInPrintFormat(printFormat) {
    if (!printFormat) return true;
    // Approved + Active Default is an intentional live override — never treat as golden.
    if (printFormat.isDefault === true && printFormat.status === LIVE_PRINT_FORMAT_STATUS) {
        return false;
    }
    if (printFormat.source === 'original' || printFormat.layout?.source === 'original') return true;
    if (printFormat.layout?.reference?.includes(GOLDEN_INVOICE_FORMAT_VERSION)) return true;
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

export function buildPdfFormatCss(printFormat, docType) {
    if (!isLivePrintFormat(printFormat)) return '';

    const m = printFormat.margins || { top: 10, right: 10, bottom: 10, left: 10, unit: 'mm' };
    const unit = m.unit || 'mm';
    const pad = `${m.top ?? 10}${unit} ${m.right ?? 10}${unit} ${m.bottom ?? 10}${unit} ${m.left ?? 10}${unit}`;

    let pageW = 210;
    if (printFormat.paperSize === 'Custom' && printFormat.customPaper?.widthMm) {
        pageW = printFormat.customPaper.widthMm;
    } else if (printFormat.layout?.pageWidthMm) {
        pageW = printFormat.layout.pageWidthMm;
    }

    const sizeMap = { A4: 'A4', Letter: 'letter', Legal: 'legal' };
    const paper = sizeMap[printFormat.paperSize] || 'A4';
    const orient = printFormat.orientation === 'landscape' ? 'landscape' : 'portrait';

    let css = `
      @page { size: ${paper} ${orient}; margin: 0; }
      .page { width: ${pageW}mm; padding: ${pad}; box-sizing: border-box; position: relative; }
    `;

    // Match frontend hasBlockLayout: apply designer absolute blocks whenever saved blocks exist,
    // so PDF geometry matches Print Format Designer / browser print.
    const blocks = printFormat.layout?.blocks;
    const hasBlocks = blocks && typeof blocks === 'object' && Object.keys(blocks).length > 0;
    if (docType && hasBlocks) {
        css += buildPdfBlockLayoutCss(printFormat, docType);
    } else {
        const sections = printFormat.layout?.sections || {};
        Object.entries(sections).forEach(([key, cfg]) => {
            if (cfg?.visible === false) {
                css += `[data-pf-section="${key}"] { display: none !important; }\n`;
            }
        });
    }

    return css;
}

function alignCss(align) {
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
}

function getLayoutMinHeightMm(blocks, padMm = 4) {
    let maxBottom = 0;
    Object.values(blocks || {}).forEach((b) => {
        if (!b || b.visible === false) return;
        maxBottom = Math.max(maxBottom, (Number(b.y) || 0) + (Number(b.height) || 10));
    });
    return Math.max(maxBottom + padMm, 50);
}

function buildPdfBlockLayoutCss(printFormat, docType) {
    const blocks = printFormat.layout.blocks || {};
    const minH = getLayoutMinHeightMm(blocks);
    let css = `.page { position: relative !important; width: 100% !important; min-height: ${minH}mm !important; height: auto !important; }\n`;

    Object.entries(blocks).forEach(([id, b]) => {
        if (!b) return;
        if (b.visible === false) {
            css += `[data-pf-block="${id}"] { display: none !important; }\n`;
            return;
        }
        const fs = b.fontSize ? `font-size: ${b.fontSize}pt !important;` : '';
        const fw = b.bold ? 'font-weight: 700 !important;' : '';
        const ta = `text-align: ${alignCss(b.align)} !important;`;
        const border = b.border ? 'border: 1px solid #000 !important;' : '';
        css += `[data-pf-block="${id}"] {
          position: absolute !important;
          left: ${b.x}mm !important;
          top: ${b.y}mm !important;
          width: ${b.width}mm !important;
          min-height: ${b.height || 10}mm !important;
          box-sizing: border-box !important;
          ${fs}${fw}${ta}${border}
        }\n`;
    });

    const cols = printFormat.layout?.itemTable?.columns || [];
    cols.forEach((col) => {
        if (col.visible === false) {
            css += `[data-pf-col="${col.id}"] { display: none !important; }\n`;
        } else if (col.widthPct) {
            css += `[data-pf-col="${col.id}"], col[data-pf-col="${col.id}"] { width: ${col.widthPct}% !important; }\n`;
        }
        if (col.align) {
            css += `td[data-pf-col="${col.id}"], tbody [data-pf-col="${col.id}"] { text-align: ${alignCss(col.align)} !important; }\n`;
        }
        const ha = col.headerAlign || col.align;
        if (ha) {
            css += `th[data-pf-col="${col.id}"], thead [data-pf-col="${col.id}"] { text-align: ${alignCss(ha)} !important; }\n`;
        }
        if (col.fontSize) {
            css += `[data-pf-col="${col.id}"] { font-size: ${col.fontSize}pt !important; }\n`;
        }
    });

    const fields = printFormat.layout?.fields || {};
    Object.entries(fields).forEach(([id, f]) => {
        if (!f || f.onCanvas !== true) return;
        if (f.visible === false) {
            css += `[data-pf-field="${id}"] { display: none !important; }\n`;
            return;
        }
        const fs = f.fontSize ? `font-size: ${f.fontSize}pt !important;` : '';
        const fw = f.bold ? 'font-weight: 700 !important;' : '';
        const ta = f.align ? `text-align: ${alignCss(f.align)} !important;` : '';
        const border = f.border ? 'border: 1px solid #000 !important;' : '';
        css += `[data-pf-field="${id}"] {
          position: absolute !important;
          left: ${f.x}mm !important;
          top: ${f.y}mm !important;
          width: ${f.width}mm !important;
          min-height: ${f.height || 8}mm !important;
          box-sizing: border-box !important;
          ${fs}${fw}${ta}${border}
        }\n`;
    });

    return css;
}
