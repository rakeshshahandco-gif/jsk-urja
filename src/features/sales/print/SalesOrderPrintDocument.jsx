/**
 * SINGLE Sales Order print render engine.
 * Used by: Browser Print, Print Preview, Designer (editable shell), and mirrored by PDF HTML.
 * Designer only changes layout metadata; this component renders the same document content.
 *
 * Active Default with blocks → absolute mm block layout (same as Designer), paginated to A4.
 * No Active Default → legacy golden multi-page flow.
 */
import React from 'react';
import { PRINT_BLOCK_IDS, mergeBlocks, mergeColumns } from '@/constants/printFormatSections';
import { buildBlockLayoutCss, blockInlineStyle, hasBlockLayout } from '@/utils/printFormatBlockRuntime';
import { isLivePrintFormat, buildPrintFormatCss } from '@/utils/printFormatRuntime';
import {
    SalesOrderPrintBlockContent,
    SoBlockApprovalLines,
    SoBlockBankDetails,
    SoBlockCompanyDetails,
    SoBlockCustomerDetails,
    SoBlockDocumentDetails,
    SoBlockDocumentNumber,
    SoBlockDocumentTitle,
    SoBlockItemTable,
    SoBlockLogo,
    SoBlockRemarks,
    SoBlockTerms,
    SoBlockTotalsBox,
    SO_PRINT_COLUMNS,
} from './SalesOrderPrintBlocks';
import {
    paginateSoItems,
    paginateBlockSoItems,
    soItemSrStart,
    resolveGstFlags,
    fmtDate,
    SO_PRINT_PAGE_WIDTH_MM,
    SO_PRINT_PAGE_HEIGHT_MM,
    SO_BLOCK_FIRST_PAGE_IDS,
    SO_BLOCK_LAST_PAGE_IDS,
} from './salesOrderPrintUtils';

/** Scale visible column widthPct so they sum to 100 — prevents crushed HSN/UOM in print. */
function normalizeColumnWidths(columns = []) {
    const list = (columns || []).map((c) => ({ ...c }));
    const visible = list.filter((c) => c.visible !== false && c.id !== 'spacer');
    const sum = visible.reduce((s, c) => s + (Number(c.widthPct) || 0), 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.5) {
        visible.forEach((c) => {
            c.widthPct = Math.round(((Number(c.widthPct) || 0) / sum) * 1000) / 10;
        });
    }
    return list;
}

function marginPadding(printFormat) {
    if (!printFormat?.margins) return '10mm';
    const m = printFormat.margins;
    const u = m.unit || 'mm';
    return `${m.top ?? 10}${u} ${m.right ?? 10}${u} ${m.bottom ?? 10}${u} ${m.left ?? 10}${u}`;
}

/**
 * @param {'print'|'designer'|'preview'} mode
 * @param {object|null} printFormat — Approved + Active Default with blocks drives live print
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
    // /print-formats/active returns Approved + Active Default (or null).
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
    // Print/preview uses the approved full-width AFTER flow.
    // Live designer block widths were leaving a blank right band and crushing columns.
    // Designer mode still uses the saved block layout unchanged.
    const useBlockLayout = designerMode;

    const blocks = useBlockLayout
        ? mergeBlocks(printFormat?.layout?.blocks || {}, 'Sales Order')
        : null;

    // Print/preview always use the approved 8-column AFTER layout.
    // Designer still merges saved format columns so the designer UI is unchanged.
    const approvedPrintColumns = SO_PRINT_COLUMNS.map((c) => ({
        id: c.id,
        label: c.label,
        widthPct: c.widthPct,
        width: c.width,
        visible: true,
        align: c.align,
    }));
    const columns = designerMode
        ? normalizeColumnWidths(mergeColumns(printFormat?.layout?.itemTable?.columns || [], 'Sales Order'))
        : approvedPrintColumns;

    const pageCss = useBlockLayout && !designerMode && printFormat
        ? `
          ${buildPrintFormatCss(printFormat, rootClassName, 'Sales Order')}
          .${rootClassName} .pf-block-layout-root {
            position: relative !important;
            display: block !important;
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
                    width: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                    maxWidth: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                    margin: '0 auto',
                    padding: 0,
                    boxSizing: 'border-box',
                    background: '#fff',
                }}
            >
                {pageCss ? <style>{pageCss}</style> : null}
                {designerMode ? (
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
                        pageItems={so?.items || []}
                        pageIdx={0}
                        isLastPage
                        isFirstPage
                        srStart={1}
                        totalPages={1}
                    />
                ) : (
                    <SalesOrderBlockLayoutPages
                        so={so}
                        company={company}
                        user={user}
                        blocks={blocks}
                        columns={columns}
                        printFormat={printFormat}
                        onColumnHeaderClick={onColumnHeaderClick}
                        selectedColumnId={selectedColumnId}
                    />
                )}
            </div>
        );
    }

    return (
        <div
            className={`print-only ${rootClassName} ${className}`.trim()}
            style={{
                display: visible ? undefined : 'none',
                width: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                maxWidth: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                margin: '0 auto',
                padding: 0,
                boxSizing: 'border-box',
            }}
        >
            <SalesOrderFlowPages so={so} company={company} user={user} columns={columns} />
        </div>
    );
}

function SalesOrderBlockLayoutPages({
    so,
    company,
    user,
    blocks,
    columns,
    printFormat,
    onColumnHeaderClick,
    selectedColumnId,
}) {
    const pages = paginateBlockSoItems(so?.items || [], printFormat);
    const totalPages = pages.length;

    return pages.map((pageItems, pageIdx) => {
        const isFirstPage = pageIdx === 0;
        const isLastPage = pageIdx === totalPages - 1;
        const srStart = soItemSrStart(pages, pageIdx);
        return (
            <SalesOrderBlockLayoutPage
                key={pageIdx}
                so={so}
                company={company}
                user={user}
                blocks={blocks}
                columns={columns}
                forceDesignerInline
                printFormat={printFormat}
                pageItems={pageItems}
                pageIdx={pageIdx}
                isFirstPage={isFirstPage}
                isLastPage={isLastPage}
                srStart={srStart}
                totalPages={totalPages}
                onColumnHeaderClick={onColumnHeaderClick}
                selectedColumnId={selectedColumnId}
            />
        );
    });
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
    pageItems,
    pageIdx = 0,
    isFirstPage = true,
    isLastPage = true,
    srStart = 1,
    totalPages = 1,
}) {
    const marginPad = marginPadding(printFormat);
    const tableBlock = blocks?.itemTable;

    return (
        <div
            className="print-content print-page pf-block-layout-root"
            data-pf-page={pageIdx + 1}
            style={{
                position: 'relative',
                width: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                maxWidth: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                height: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                minHeight: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                maxHeight: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                padding: marginPad,
                background: '#fff',
                boxSizing: 'border-box',
                overflow: 'hidden',
                pageBreakAfter: isLastPage ? 'auto' : 'always',
                breakAfter: isLastPage ? 'auto' : 'page',
            }}
        >
            {totalPages > 1 && (
                <div
                    className="pf-page-number"
                    style={{
                        position: 'absolute',
                        bottom: '3mm',
                        right: '4mm',
                        fontSize: '8pt',
                        color: '#666',
                        zIndex: 30,
                    }}
                >
                    Page {pageIdx + 1} of {totalPages}
                </div>
            )}

            {!isFirstPage && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        right: 0,
                        height: '22mm',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #000',
                        boxSizing: 'border-box',
                        paddingBottom: '2mm',
                        fontSize: '9pt',
                    }}
                >
                    <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>
                        {company?.companyName || 'JSK URJA'}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <strong>Order No:</strong> {so.soNumber} | <strong>Date:</strong> {fmtDate(so.soDate)}
                        {' '}(continued)
                    </div>
                </div>
            )}

            {PRINT_BLOCK_IDS.map((blockId) => {
                const block = blocks?.[blockId];
                if (!block || block.visible === false) return null;

                if (SO_BLOCK_FIRST_PAGE_IDS.includes(blockId) && !isFirstPage) return null;
                if (SO_BLOCK_LAST_PAGE_IDS.includes(blockId) && !isLastPage) return null;

                let style = forceDesignerInline
                    ? {
                        ...blockInlineStyle(block, {
                            selected: Boolean(selectedBlockId === blockId && onBlockSelect),
                        }),
                        outline: selectedBlockId === blockId && onBlockSelect ? '2px solid #2563eb' : undefined,
                        cursor: onBlockSelect ? (selectedBlockId === blockId ? 'move' : 'pointer') : 'default',
                        background: selectedBlockId === blockId && onBlockSelect ? 'rgba(37,99,235,0.04)' : 'transparent',
                    }
                    : blockInlineStyle(block, { selected: false });

                // Continuation pages: place item table under compact header
                if (blockId === 'itemTable' && !isFirstPage && tableBlock) {
                    style = {
                        ...style,
                        top: '28mm',
                        left: `${Number(tableBlock.x) || 0}mm`,
                        width: `${Number(tableBlock.width) || 190}mm`,
                        minHeight: `${Math.max(Number(tableBlock.height) || 100, 180)}mm`,
                    };
                }

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
                            pageItems={blockId === 'itemTable' ? pageItems : so?.items || []}
                            pageIdx={pageIdx}
                            isLastPage={isLastPage}
                            embedTotalsInTable={false}
                            onColumnHeaderClick={onColumnHeaderClick}
                            selectedColumnId={selectedColumnId}
                            srStart={blockId === 'itemTable' ? srStart : null}
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
                    breakAfter: isLastPage ? 'auto' : 'page',
                    position: 'relative',
                    width: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                    maxWidth: `${SO_PRINT_PAGE_WIDTH_MM}mm`,
                    height: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                    minHeight: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                    maxHeight: `${SO_PRINT_PAGE_HEIGHT_MM}mm`,
                    padding: '10mm',
                    background: '#fff',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
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
                                    <SoBlockLogo company={company} />
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

                <div data-pf-block="itemTable" data-pf-section="itemTable">
                    <SoBlockItemTable
                        so={so}
                        pageItems={pageItems}
                        pageIdx={pageIdx}
                        isLastPage={isLastPage}
                        showTotals={false}
                        columns={columns}
                        srStart={soItemSrStart(pages, pageIdx)}
                    />
                </div>

                {isLastPage && (
                    <>
                        <div
                            data-pf-block="totalsBox"
                            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, marginBottom: 8 }}
                        >
                            <div style={{ width: '88mm', minWidth: '88mm' }}>
                                <SoBlockTotalsBox so={so} showAmountInWords={false} />
                            </div>
                        </div>
                        {so.amountInWords ? (
                            <div style={{ fontSize: '9pt', fontStyle: 'italic', textTransform: 'capitalize', marginBottom: 10 }}>
                                <strong>Amount in Words: </strong>{so.amountInWords}
                            </div>
                        ) : null}
                        <div data-pf-block="remarks" data-pf-section="remarks" style={{ marginTop: so.remarks ? 10 : 0 }}>
                            <SoBlockRemarks so={so} />
                        </div>
                        <div
                            className="print-footer"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 28,
                                marginTop: 18,
                            }}
                        >
                            <div data-pf-block="bankDetails" data-pf-section="bankDetails" style={{ flex: 1 }}>
                                <SoBlockBankDetails company={company} />
                            </div>
                            <div data-pf-block="terms" data-pf-section="terms" style={{ flex: 1 }}>
                                <SoBlockTerms so={so} />
                            </div>
                        </div>
                        <div data-pf-block="signature" data-pf-section="signature">
                            <SoBlockApprovalLines />
                        </div>
                    </>
                )}
            </div>
        );
    });
}
