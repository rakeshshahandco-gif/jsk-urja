/**
 * SINGLE Sales Order print render engine.
 * Used by: Browser Print, Print Preview, Designer (editable shell), and mirrored by PDF HTML.
 * Designer only changes layout metadata; this component renders the same document content.
 */
import React from 'react';
import { PRINT_BLOCK_IDS, mergeBlocks, mergeColumns } from '@/constants/printFormatSections';
import { buildBlockLayoutCss, blockInlineStyle, getLayoutMinHeightMm, hasBlockLayout } from '@/utils/printFormatBlockRuntime';
import { isLivePrintFormat } from '@/utils/printFormatRuntime';
import {
    SalesOrderPrintBlockContent,
    SoBlockBankDetails,
    SoBlockCompanyDetails,
    SoBlockCustomerDetails,
    SoBlockDocumentDetails,
    SoBlockDocumentNumber,
    SoBlockDocumentTitle,
    SoBlockItemTable,
    SoBlockLogo,
    SoBlockRemarks,
    SoBlockSignature,
    SO_PRINT_COLUMNS,
} from './SalesOrderPrintBlocks';
import { paginateSoItems, resolveGstFlags, fmtDate } from './salesOrderPrintUtils';

/** Scale visible column widthPct so they sum to 100 — prevents crushed HSN/UOM in print. */
function normalizeColumnWidths(columns = []) {
    const list = (columns || []).map((c) => ({ ...c }));
    const visible = list.filter((c) => c.visible !== false);
    const sum = visible.reduce((s, c) => s + (Number(c.widthPct) || 0), 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.5) {
        visible.forEach((c) => {
            c.widthPct = Math.round(((Number(c.widthPct) || 0) / sum) * 1000) / 10;
        });
    }
    return list;
}

/**
 * @param {'print'|'designer'|'preview'} mode
 * @param {object|null} printFormat — when live Approved+Default, block layout drives print
 */
export default function SalesOrderPrintDocument({
    so,
    company = {},
    user,
    printFormat = null,
    mode = 'print',
    selectedBlockId = null,
    onBlockSelect,
    onBlockMouseDown,
    onColumnHeaderClick,
    selectedColumnId = null,
    className = '',
    rootClassName = 'so-print-root',
    visible = true,
}) {
    if (!so) return null;

    const designerMode = mode === 'designer';
    // /print-formats/active already returns only Approved + Active Default (or null).
    // If that payload has designer blocks, use the same absolute block renderer as the designer.
    const liveCustom = Boolean(
        !designerMode
        && printFormat
        && hasBlockLayout(printFormat)
        && (
            isLivePrintFormat(printFormat)
            || printFormat.isDefault === true
            || printFormat.status === 'approved'
        )
    );
    const useBlockLayout = designerMode || liveCustom;

    const blocks = useBlockLayout
        ? mergeBlocks(printFormat?.layout?.blocks || {}, 'Sales Order')
        : null;

    // Live/designer: use saved designer columns (normalize widths so print doesn't crush HSN/UOM).
    // Golden flow fallback: fixed SO columns only — never expand via full catalog.
    const columns = useBlockLayout
        ? normalizeColumnWidths(mergeColumns(printFormat?.layout?.itemTable?.columns || [], 'Sales Order'))
        : SO_PRINT_COLUMNS.map((c) => ({
            id: c.id,
            label: c.label,
            widthPct: c.id === 'spacer' ? 10 : undefined,
            width: c.width,
            visible: true,
            align: c.align,
        }));

    // Same absolute block CSS the designer uses — do not depend on isLivePrintFormat gate here.
    const layoutCss = useBlockLayout && !designerMode && printFormat
        ? `
          .${rootClassName} .pf-block-layout-root {
            position: relative !important;
            display: block !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .${rootClassName} .print-content.pf-block-layout-root {
            display: block !important;
            flex-direction: unset !important;
          }
          ${buildBlockLayoutCss(printFormat, rootClassName, 'Sales Order')}
        `
        : '';

    if (useBlockLayout) {
        return (
            <div
                className={`${rootClassName} ${className}`.trim()}
                data-pf-engine="sales-order-blocks"
                data-pf-live={liveCustom ? '1' : '0'}
                style={{
                    display: visible || designerMode ? 'block' : 'none',
                    width: '210mm',
                    maxWidth: '210mm',
                    margin: '0 auto',
                    padding: 0,
                    boxSizing: 'border-box',
                    background: '#fff',
                }}
            >
                {layoutCss ? <style>{layoutCss}</style> : null}
                <SalesOrderBlockLayoutPage
                    so={so}
                    company={company}
                    user={user}
                    blocks={blocks}
                    columns={columns}
                    forceDesignerInline
                    selectedBlockId={selectedBlockId}
                    onBlockSelect={onBlockSelect}
                    onBlockMouseDown={onBlockMouseDown}
                    onColumnHeaderClick={onColumnHeaderClick}
                    selectedColumnId={selectedColumnId}
                    printFormat={printFormat}
                />
            </div>
        );
    }

    return (
        <div
            className={`print-only ${rootClassName} ${className}`.trim()}
            style={{
                display: visible ? undefined : 'none',
                width: '210mm',
                maxWidth: '210mm',
                margin: '0 auto',
                padding: 0,
                boxSizing: 'border-box',
            }}
        >
            <SalesOrderFlowPages so={so} company={company} user={user} columns={columns} />
        </div>
    );
}

function SalesOrderBlockLayoutPage({
    so,
    company,
    user,
    blocks,
    columns,
    forceDesignerInline,
    selectedBlockId,
    onBlockSelect,
    onBlockMouseDown,
    onColumnHeaderClick,
    selectedColumnId,
    printFormat,
}) {
    const marginPad = printFormat?.margins
        ? `${printFormat.margins.top ?? 10}${printFormat.margins.unit || 'mm'} ${printFormat.margins.right ?? 10}${printFormat.margins.unit || 'mm'} ${printFormat.margins.bottom ?? 10}${printFormat.margins.unit || 'mm'} ${printFormat.margins.left ?? 10}${printFormat.margins.unit || 'mm'}`
        : '10mm';
    const minH = getLayoutMinHeightMm(blocks);

    return (
        <div
            className="print-content print-page pf-block-layout-root"
            style={{
                position: 'relative',
                width: '210mm',
                maxWidth: '210mm',
                minHeight: `${Math.max(minH + 20, 270)}mm`,
                padding: marginPad,
                background: '#fff',
                boxSizing: 'border-box',
            }}
        >
            {PRINT_BLOCK_IDS.map((blockId) => {
                const block = blocks?.[blockId];
                if (!block || block.visible === false) return null;
                const selected = Boolean(forceDesignerInline && selectedBlockId === blockId && onBlockSelect);
                // Always apply the same absolute geometry as the Designer canvas.
                const style = forceDesignerInline
                    ? {
                        ...blockInlineStyle(block, { selected }),
                        // Print must not show designer chrome
                        outline: selected && onBlockSelect ? '2px solid #2563eb' : undefined,
                        cursor: onBlockSelect ? (selected ? 'move' : 'pointer') : 'default',
                        background: selected && onBlockSelect ? 'rgba(37,99,235,0.04)' : 'transparent',
                    }
                    : blockInlineStyle(block, { selected: false });
                return (
                    <div
                        key={blockId}
                        data-pf-block={blockId}
                        style={style}
                        onClick={
                            onBlockSelect
                                ? (e) => {
                                    e.stopPropagation();
                                    onBlockSelect(blockId);
                                }
                                : undefined
                        }
                        onMouseDown={
                            onBlockMouseDown
                                ? (e) => onBlockMouseDown(e, blockId)
                                : undefined
                        }
                    >
                        <SalesOrderPrintBlockContent
                            blockId={blockId}
                            so={so}
                            company={company}
                            user={user}
                            columns={columns}
                            pageItems={so?.items || []}
                            pageIdx={0}
                            isLastPage
                            embedTotalsInTable={false}
                            onColumnHeaderClick={onColumnHeaderClick}
                            selectedColumnId={selectedColumnId}
                        />
                    </div>
                );
            })}
        </div>
    );
}

/** Golden multi-page flow — default when no live custom format. Same block content pieces. */
function SalesOrderFlowPages({ so, company, user, columns }) {
    const { gstApplicable } = resolveGstFlags(so);
    const pages = paginateSoItems(so.items || []);

    return pages.map((pageItems, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === pages.length - 1;
        const totalPages = pages.length;

        return (
            <div
                key={pageIdx}
                className="print-content"
                style={{
                    pageBreakAfter: isLastPage ? 'auto' : 'always',
                    position: 'relative',
                    width: '210mm',
                    maxWidth: '210mm',
                    minHeight: '270mm',
                    padding: '10mm',
                    background: '#fff',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ position: 'absolute', bottom: '5mm', right: '10mm', fontSize: '8pt', color: '#666' }}>
                    Page {pageIdx + 1} of {totalPages}
                </div>

                {isFirstPage ? (
                    <>
                        <div
                            className="p-header"
                            data-pf-section="header"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                marginBottom: 20,
                            }}
                        >
                            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                                <div data-pf-block="logo">
                                    <SoBlockLogo />
                                </div>
                                <div data-pf-block="companyDetails" style={{ flex: 1 }}>
                                    <SoBlockCompanyDetails company={company} gstApplicable={gstApplicable} />
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div data-pf-block="documentTitle">
                                    <SoBlockDocumentTitle so={so} />
                                </div>
                                <div data-pf-block="documentNumber">
                                    <SoBlockDocumentNumber so={so} gstApplicable={gstApplicable} />
                                </div>
                            </div>
                        </div>

                        <div style={{ borderBottom: '1.5px solid #000', marginBottom: 20 }} />

                        <div
                            className="p-summary"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 40,
                                marginBottom: 20,
                            }}
                        >
                            <div data-pf-block="customerDetails" data-pf-section="customerDetails" style={{ flex: 1 }}>
                                <SoBlockCustomerDetails so={so} gstApplicable={gstApplicable} />
                            </div>
                            <div data-pf-block="documentDetails" data-pf-section="documentDetails" style={{ width: 300 }}>
                                <SoBlockDocumentDetails so={so} />
                            </div>
                        </div>
                    </>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 15,
                            borderBottom: '1px solid #000',
                            paddingBottom: 5,
                        }}
                    >
                        <div style={{ fontSize: '14pt', fontWeight: 900, textTransform: 'uppercase' }}>
                            {company.companyName || 'JSK URJA'}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                            <strong>Order No:</strong> {so.soNumber} | <strong>Date:</strong> {fmtDate(so.soDate)}
                        </div>
                    </div>
                )}

                <div data-pf-block="itemTable" data-pf-section="itemTable" style={{ marginBottom: 'auto' }}>
                    <SoBlockItemTable
                        so={so}
                        pageItems={pageItems}
                        pageIdx={pageIdx}
                        isLastPage={isLastPage}
                        showTotals
                        columns={columns}
                    />
                </div>

                {/* totals live inside item table in flow mode; keep empty totals marker for CSS */}
                <div data-pf-block="totalsBox" className="pf-flow-fallback" style={{ display: 'none' }} />

                {isLastPage && (
                    <>
                        <div data-pf-block="remarks" data-pf-section="remarks" style={{ marginTop: so.remarks ? 14 : 0 }}>
                            <SoBlockRemarks so={so} />
                        </div>
                        <div
                            className="print-footer"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-end',
                                marginTop: 30,
                            }}
                        >
                            <div data-pf-block="bankDetails" data-pf-section="bankDetails">
                                <SoBlockBankDetails />
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '8pt', color: '#666' }}>
                                This is a computer generated order and does not require a physical signature.
                            </div>
                            <div data-pf-block="signature" data-pf-section="signature" style={{ width: 220 }}>
                                <SoBlockSignature so={so} company={company} user={user} />
                            </div>
                        </div>
                        <div data-pf-block="terms" style={{ display: 'none' }} />
                    </>
                )}
            </div>
        );
    });
}
