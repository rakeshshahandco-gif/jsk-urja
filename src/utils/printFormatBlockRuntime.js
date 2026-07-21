import { mergeBlocks, PRINT_BLOCK_IDS } from '@/constants/printFormatSections';

export function hasBlockLayout(printFormat) {
    const blocks = printFormat?.layout?.blocks;
    if (!blocks || typeof blocks !== 'object') return false;
    // Accept engine v2+ OR any saved blocks map (designer always saves blocks).
    const ver = Number(printFormat?.layout?.engineVersion || 0);
    if (ver >= 2) return true;
    return Object.keys(blocks).length > 0;
}

export function getMergedBlocks(printFormat, docType) {
    if (!hasBlockLayout(printFormat)) return null;
    return mergeBlocks(printFormat.layout.blocks, docType);
}

/** Bottom edge of visible blocks + small padding — avoids empty page tail. */
export function getLayoutMinHeightMm(blocks, { padMm = 4 } = {}) {
    if (!blocks) return 50;
    let maxBottom = 0;
    Object.values(blocks).forEach((b) => {
        if (!b || b.visible === false) return;
        maxBottom = Math.max(maxBottom, (Number(b.y) || 0) + (Number(b.height) || 10));
    });
    return Math.max(maxBottom + padMm, 50);
}

function alignToCss(align) {
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
}

export function blockInlineStyle(block, { selected = false } = {}) {
    if (!block || block.visible === false) return { display: 'none' };
    const fs = block.fontSize ? `${block.fontSize}pt` : undefined;
    return {
        position: 'absolute',
        left: `${block.x}mm`,
        top: `${block.y}mm`,
        width: `${block.width}mm`,
        minHeight: block.height ? `${block.height}mm` : undefined,
        textAlign: alignToCss(block.align),
        fontSize: fs,
        fontWeight: block.bold ? 700 : 400,
        border: block.border ? '1px solid #000' : undefined,
        boxSizing: 'border-box',
        overflow: 'visible',
        outline: selected ? '2px solid #2563eb' : undefined,
        outlineOffset: selected ? 2 : undefined,
        cursor: selected ? 'move' : 'pointer',
        zIndex: selected ? 20 : 1,
        background: selected ? 'rgba(37,99,235,0.04)' : 'transparent',
    };
}

export function buildBlockLayoutCss(printFormat, rootClass, docType) {
    if (!hasBlockLayout(printFormat)) return '';
    const blocks = getMergedBlocks(printFormat, docType);
    if (!blocks) return '';

    const minH = getLayoutMinHeightMm(blocks);

    let css = `
      .${rootClass} .pf-block-layout-root {
        position: relative !important;
        width: 100% !important;
        max-width: 100% !important;
        min-height: ${minH}mm !important;
        box-sizing: border-box !important;
        display: block !important;
      }
      @media print {
        .${rootClass} .pf-block-layout-root.print-content,
        .${rootClass} .pf-block-layout-root.print-page {
          width: 210mm !important;
          max-width: 210mm !important;
          height: 297mm !important;
          min-height: 297mm !important;
          max-height: 297mm !important;
        }
      }
      .${rootClass} .pf-block-layout-root .pf-block-flow-spacer {
        flex: none !important;
        min-height: 0 !important;
      }
      .${rootClass} .pf-block-layout-root > .pf-page-number {
        display: block !important;
      }
      .${rootClass} .pf-block-layout-root > div:not(.pf-page-number):not([data-pf-block]) {
        display: contents !important;
      }
      .${rootClass} .pf-flow-fallback { display: none !important; }
    `;

    PRINT_BLOCK_IDS.forEach((id) => {
        const b = blocks[id];
        if (!b) return;
        if (b.visible === false) {
            css += `.${rootClass} [data-pf-block="${id}"] { display: none !important; }\n`;
            return;
        }
        const fs = b.fontSize ? `font-size: ${b.fontSize}pt !important;` : '';
        const fw = b.bold ? 'font-weight: 700 !important;' : '';
        const ta = `text-align: ${alignToCss(b.align)} !important;`;
        const border = b.border ? 'border: 1px solid #000 !important;' : 'border: none !important;';
        css += `.${rootClass} [data-pf-block="${id}"] {
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
            css += `.${rootClass} [data-pf-col="${col.id}"] { display: none !important; }\n`;
        } else if (col.widthPct) {
            css += `.${rootClass} [data-pf-col="${col.id}"] { width: ${col.widthPct}% !important; }\n`;
            css += `.${rootClass} col[data-pf-col="${col.id}"] { width: ${col.widthPct}% !important; }\n`;
        }
        if (col.align) {
            css += `.${rootClass} td[data-pf-col="${col.id}"], .${rootClass} tbody [data-pf-col="${col.id}"] { text-align: ${alignToCss(col.align)} !important; }\n`;
        }
        const ha = col.headerAlign || col.align;
        if (ha) {
            css += `.${rootClass} th[data-pf-col="${col.id}"], .${rootClass} thead [data-pf-col="${col.id}"] { text-align: ${alignToCss(ha)} !important; }\n`;
        }
        if (col.fontSize) {
            css += `.${rootClass} [data-pf-col="${col.id}"] { font-size: ${col.fontSize}pt !important; }\n`;
        }
    });

    const fields = printFormat.layout?.fields || {};
    Object.entries(fields).forEach(([id, f]) => {
        if (!f || f.onCanvas !== true) return;
        if (f.visible === false) {
            css += `.${rootClass} [data-pf-field="${id}"] { display: none !important; }\n`;
            return;
        }
        const fs = f.fontSize ? `font-size: ${f.fontSize}pt !important;` : '';
        const fw = f.bold ? 'font-weight: 700 !important;' : '';
        const ta = f.align ? `text-align: ${alignToCss(f.align)} !important;` : '';
        const border = f.border ? 'border: 1px solid #000 !important;' : '';
        css += `.${rootClass} [data-pf-field="${id}"] {
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

export function buildTableColgroup(columns = []) {
    return columns.filter((c) => c.visible !== false).map((c) => (
        `<col data-pf-col="${c.id}" style="width:${c.widthPct}%" />`
    )).join('');
}
