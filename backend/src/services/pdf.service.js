import puppeteer from 'puppeteer';
import { numberToWords } from '../utils/numberToWords.js';
import fs from 'fs';
import path from 'path';

/**
 * PDF Service for generating high-quality document PDFs using Puppeteer
 * Matching the "Actual Existing" JSK Innovative Tech format exactly.
 */
class PDFService {
    /**
     * Get logo as base64 for reliable rendering in PDFs
     */
    static getLogoBase64() {
        try {
            // Try common paths relative to root and backend
            const possiblePaths = [
                path.resolve('public/logo.jpeg'),
                path.resolve('../public/logo.jpeg'),
                path.join(process.cwd(), 'public/logo.jpeg')
            ];

            for (const logoPath of possiblePaths) {
                if (fs.existsSync(logoPath)) {
                    const bitmap = fs.readFileSync(logoPath);
                    return `data:image/jpeg;base64,${Buffer.from(bitmap).toString('base64')}`;
                }
            }
        } catch (e) {
            console.error('[PDF Service] Logo load error:', e.message);
        }
        return '';
    }

    /**
     * Common Styles for all documents
     */
    static getCommonStyles() {
        return `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');
                * { box-sizing: border-box; font-family: 'Roboto', 'Helvetica', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body { margin: 0; padding: 12mm; color: #000; background: #fff; font-size: 9pt; line-height: 1.2; }
                
                /* Header Section */
                .header-table { width: 100%; border-bottom: 2px solid #000; margin-bottom: 10px; border-collapse: collapse; }
                .logo-cell { width: 100px; padding-bottom: 10px; }
                .logo-img { max-height: 55px; max-width: 110px; object-fit: contain; }
                .company-cell { padding-bottom: 10px; padding-left: 10px; text-align: left; vertical-align: top; }
                .company-header h1 { margin: 0; font-size: 17pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
                .company-addr { font-size: 7.5pt; color: #000; margin-top: 2px; line-height: 1.2; font-weight: 400; }
                
                .doc-identity-cell { width: 150px; text-align: right; vertical-align: top; padding-bottom: 10px; }
                .doc-type-box { display: inline-block; border: 1px solid #000; padding: 5px 15px; font-size: 15pt; font-weight: 900; text-transform: uppercase; margin-bottom: 5px; }
                .doc-number { font-size: 13pt; font-weight: 700; }
                
                /* Party Info Section */
                .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                .info-label { font-weight: 900; width: 135px; white-space: nowrap; font-size: 9pt; vertical-align: top; }
                .info-value { font-weight: 400; text-transform: uppercase; font-size: 9pt; vertical-align: top; }
                .info-col-right { text-align: right; }

                /* Items Table */
                .items-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; table-layout: fixed; }
                .items-table th { 
                    border: 1px solid #000; padding: 5px 3px; font-size: 7.5pt; font-weight: 900; 
                    text-transform: uppercase; background: #fff; text-align: left;
                }
                .items-table td { border: 1px solid #000; padding: 4px 5px; font-size: 8.5pt; vertical-align: top; word-wrap: break-word; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                
                .total-qty-row { font-weight: 900; background: #fff; height: 25px; }
                
                /* Summary Section (Bottom Right) */
                .bottom-section { display: flex; justify-content: flex-end; width: 100%; margin-top: 5px; }
                .summary-table { width: 280px; border-collapse: collapse; border: 1px solid #000; }
                .summary-table td { padding: 3px 8px; font-size: 8.5pt; border: 1px solid #000; }
                .summary-label { font-weight: 700; text-align: left; width: 140px; }
                .summary-value { font-weight: 900; text-align: right; }
                
                .in-words { border: 1px solid #000; border-top: none; padding: 4px 8px; font-size: 8pt; font-style: italic; font-weight: 700; border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000; width: 280px; margin-left: auto; text-align: right; }

                /* Final Footer */
                .final-footer { 
                    margin-top: 25px;
                    display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; 
                    align-items: flex-end; border-top: 2px solid #000; padding-top: 10px; 
                }
                .bank-info { font-size: 7.2pt; line-height: 1.3; }
                .bank-info strong { font-weight: 900; font-size: 7.5pt; text-transform: uppercase; }
                .footer-notice { font-size: 6.5pt; text-align: center; font-style: italic; padding: 0 10px; color: #333; }
                .signatory-box { text-align: right; }
                .signatory-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; margin-bottom: 5px; }
                .signatory-name { font-size: 9pt; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; color: #000; }
                .signatory-label { font-size: 8pt; font-weight: 900; text-transform: uppercase; border-top: 1px solid #000; display: inline-block; padding-top: 2px; }
                .page-counter { font-size: 7pt; color: #777; margin-top: 3px; }

                @page { margin: 10mm 12mm; size: A4 portrait; }
            </style>
        `;
    }

    /**
     * Generate PDF reflecting the EXACT current JSK format as requested.
     * This is now a "Mirror Image" of the high-fidelity CRM layout.
     */
    static async generateDocumentPDF(docData, company, type, user) {
        const isSO = type === 'Sales Order';
        const isPO = type === 'Purchase Order';
        const isSI = type === 'Sales Invoice';

        const logoBase64 = this.getLogoBase64();
        const docNumber = isSO ? docData.soNumber : (isSI ? (docData.displayInvoiceNumber || docData.invoiceNumber) : docData.poNumber);
        const docDate = isSO ? docData.soDate : (isSI ? docData.invoiceDate : docData.poDate);
        
        const partyName = isPO ? (docData.supplierName || docData.supplierId?.supplierName) : docData.customerName;
        const billingAddr = isPO ? (docData.supplierAddress || docData.supplierId?.address) : docData.billingAddress;
        const shippingAddr = isSI ? (docData.shippingAddress || billingAddr) : (isPO ? billingAddr : (docData.shippingAddress || billingAddr));
        
        const partyState = isPO ? (docData.supplierState || docData.supplierId?.state) : (docData.billingState || docData.customerState);
        const partyStateCode = isPO ? '' : (docData.billingStateCode || docData.shippingStateCode);
        const partyGst = isPO ? (docData.supplierGstin || docData.supplierId?.gstNumber) : (docData.customerGstin || docData.shippingGstin);

        const items = docData.items || [];
        const grandTotal = docData.roundedTotal || docData.grandTotal || 0;
        const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
        const amountInWords = docData.amountInWords || numberToWords(grandTotal);
        
        const gstApplicable = docData.gstApplicable !== false;
        const isIGST = docData.gstType === 'IGST';
        const userName = user?.name || docData.createdBy?.name || 'Authorized User';

        let docTitle = type.toUpperCase();
        if (isSI) {
            docTitle = gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE';
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
                    * { box-sizing: border-box; font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body { margin: 0; padding: 10mm; color: #000; background: #fff; font-size: 9pt; line-height: 1.25; }
                    
                    .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 15px; }
                    .company-info { display: flex; gap: 20px; align-items: flex-start; }
                    .logo-img { max-height: 65px; max-width: 150px; object-fit: contain; }
                    .company-details h1 { margin: 0; font-size: 20pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
                    .company-addr { font-size: 8.5pt; color: #000; margin-top: 4px; line-height: 1.3; font-weight: 400; max-width: 450px; }
                    
                    .doc-meta { text-align: right; }
                    .doc-title { font-size: 18pt; font-weight: 900; border: 2px solid #000; padding: 2px 12px; display: inline-block; margin-bottom: 5px; }
                    .doc-id { font-size: 14pt; font-weight: 800; }

                    .bill-ship-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 15px; }
                    .address-box { border: 1px solid #000; padding: 8px; min-height: 100px; }
                    .box-label { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #444; border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 5px; }
                    .party-name { font-size: 10pt; font-weight: 800; text-transform: uppercase; margin-bottom: 3px; }
                    .party-addr { font-size: 9pt; white-space: pre-wrap; margin-bottom: 4px; }
                    
                    .ref-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; border: 1px solid #000; padding: 8px; margin-bottom: 15px; }
                    .ref-item { font-size: 9pt; }
                    .ref-item strong { font-weight: 800; min-width: 110px; display: inline-block; }

                    .items-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 0; table-layout: fixed; }
                    .items-table th { border: 1px solid #000; padding: 6px 4px; font-size: 8pt; font-weight: 800; text-transform: uppercase; background: #f5f5f5; text-align: center; }
                    .items-table td { border: 1px solid #000; padding: 6px 8px; font-size: 9pt; vertical-align: top; }
                    
                    .footer-grid { display: grid; grid-template-columns: 1.2fr 1fr; border: 1px solid #000; border-top: none; }
                    .footer-left { border-right: 1px solid #000; padding: 8px; }
                    .footer-right { padding: 0; }
                    .summary-table { width: 100%; border-collapse: collapse; }
                    .summary-table td { padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 9pt; }
                    .summary-label { font-weight: 400; }
                    .summary-value { text-align: right; font-weight: 700; }
                    .grand-total-row { background: #f5f5f5; font-weight: 900 !important; font-size: 11pt !important; }
                    
                    .words-box { border: 1px solid #000; border-top: none; padding: 8px; font-size: 9pt; background: #fafafa; }
                    .signatory-row { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-top: none; height: 100px; }
                    .receiver-sign { border-right: 1px solid #000; padding: 8px; font-size: 8pt; position: relative; }
                    .authorizer-sign { padding: 8px; text-align: center; position: relative; }

                    @page { margin: 0; size: A4 portrait; }
                </style>
            </head>
            <body>
                <div class="header-container">
                    <div class="company-info">
                        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                        <div class="company-details">
                            <h1>${company.companyName}</h1>
                            <div class="company-addr">
                                ${company.address}, ${company.city} - ${company.pincode}, ${company.state}<br/>
                                ${company.phone ? `Contact: ${company.phone}` : ''} ${company.email ? ` | Email: ${company.email}` : ''}<br/>
                                ${gstApplicable && company.gstNumber ? `<strong>GSTIN: ${company.gstNumber}</strong>` : ''} 
                                ${company.panNumber ? ` | PAN: ${company.panNumber}` : ''}<br/>
                                ${company.cin ? `CIN: ${company.cin}` : ''} ${company.urn ? ` | MSME/URN: ${company.urn}` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="doc-meta">
                        <div class="doc-title">${docTitle}</div>
                        <div class="doc-id">${docNumber}</div>
                    </div>
                </div>

                <div class="bill-ship-row">
                    <div class="address-box">
                        <div class="box-label">Billing Details:</div>
                        <div class="party-name">${partyName}</div>
                        <div class="party-addr">${billingAddr || ''}</div>
                        ${partyGst ? `<div style="font-size: 8pt;"><strong>GSTIN:</strong> ${partyGst}</div>` : ''}
                        <div style="font-size: 8pt;"><strong>State:</strong> ${partyState || ''} ${partyStateCode ? `(${partyStateCode})` : ''}</div>
                    </div>
                    <div class="address-box">
                        <div class="box-label">Shipping / Consignee Details:</div>
                        <div class="party-name">${partyName}</div>
                        <div class="party-addr">${shippingAddr || ''}</div>
                        <div style="font-size: 8pt;"><strong>State:</strong> ${partyState || ''}</div>
                    </div>
                </div>

                <div class="ref-grid">
                    <div class="ref-item"><strong>Date:</strong> ${new Date(docDate).toLocaleDateString('en-GB')}</div>
                    <div class="ref-item"><strong>Place of Supply:</strong> ${docData.placeOfSupply || partyState || ''}</div>
                    <div class="ref-item"><strong>Reference / PO No:</strong> ${docData.buyerOrderNo || '—'}</div>
                    <div class="ref-item"><strong>PO Date:</strong> ${docData.buyerOrderDate ? new Date(docData.buyerOrderDate).toLocaleDateString('en-GB') : '—'}</div>
                    ${docData.soNumber ? `<div class="ref-item"><strong>Sales Order:</strong> ${docData.soNumber}</div>` : ''}
                    ${docData.dispatchThrough ? `<div class="ref-item"><strong>Dispatch Through:</strong> ${docData.dispatchThrough}</div>` : ''}
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 35px;">SR</th>
                            <th>Description of Goods</th>
                            <th style="width: 75px;">HSN/SAC</th>
                            <th style="width: 45px;">UOM</th>
                            <th style="width: 50px;">QTY</th>
                            <th style="width: 90px; text-align: right;">Rate</th>
                            <th style="width: 100px; text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, i) => `
                            <tr>
                                <td style="text-align: center;">${i + 1}</td>
                                <td>
                                    <div style="font-weight: 800; text-transform: uppercase;">${it.itemName || it.description}</div>
                                    ${it.itemCode || it.additionalNotes ? `<div style="font-size: 7.5pt; color: #444; margin-top: 1px;">${it.itemCode ? `Code: ${it.itemCode}` : ''} ${it.additionalNotes ? `| ${it.additionalNotes}` : ''}</div>` : ''}
                                </td>
                                <td style="text-align: center;">${it.hsnCode || '—'}</td>
                                <td style="text-align: center;">${it.uom || 'NOS'}</td>
                                <td style="text-align: center; font-weight: 700;">${it.qty}</td>
                                <td style="text-align: right;">${Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700;">${Number(it.taxableAmount || (it.qty * it.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="footer-grid">
                    <div class="footer-left">
                        <div style="margin-bottom: 10px;">
                            <div class="box-label" style="border-bottom: 1px solid #eee; margin-bottom: 4px;">Bank Details:</div>
                            <div style="font-size: 8.5pt; line-height: 1.4;">
                                <strong>${company.bankName || 'BANK OF BARODA'}</strong><br/>
                                Account Name: ${company.companyName}<br/>
                                Account No: ${company.accountNo || '—'}<br/>
                                IFSC Code: ${company.ifscCode || '—'} | Branch: ${company.branchName || '—'}
                            </div>
                        </div>
                        <div>
                            <div class="box-label" style="border-bottom: 1px solid #eee; margin-bottom: 4px;">Terms & Conditions:</div>
                            <div style="font-size: 7.5pt; color: #333; line-height: 1.3;">
                                1. Goods once sold will not be taken back.<br/>
                                2. Subject to MUMBAI Jurisdiction.<br/>
                                3. We declare that this invoice shows the actual price of the goods described.
                            </div>
                        </div>
                    </div>
                    <div class="footer-right">
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Total Taxable Value</td>
                                <td class="summary-value">₹ ${(docData.totalTaxableAmount || docData.subTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            ${gstApplicable ? (
                                isIGST ? `
                                    <tr>
                                        <td class="summary-label">+ IGST @ ${items[0]?.taxRate || items[0]?.gstRate || 18}%</td>
                                        <td class="summary-value">₹ ${(docData.totalIgst || docData.totalGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ` : `
                                    <tr>
                                        <td class="summary-label">+ CGST @ ${(items[0]?.taxRate || items[0]?.gstRate || 18) / 2}%</td>
                                        <td class="summary-value">₹ ${(docData.totalCgst || (docData.totalGst / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                        <td class="summary-label">+ SGST @ ${(items[0]?.taxRate || items[0]?.gstRate || 18) / 2}%</td>
                                        <td class="summary-value">₹ ${(docData.totalSgst || (docData.totalGst / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                `
                            ) : ''}
                            ${docData.roundOff ? `<tr><td class="summary-label">Round Off</td><td class="summary-value">${Number(docData.roundOff).toFixed(2)}</td></tr>` : ''}
                            <tr class="grand-total-row">
                                <td style="font-weight: 900; border-bottom: none;">Grand Total</td>
                                <td style="text-align: right; font-weight: 900; border-bottom: none;">₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                <div class="words-box">
                    <strong>Amount in Words:</strong> <span style="text-transform: capitalize; font-weight: 700;">${amountInWords}</span>
                </div>

                <div class="signatory-row">
                    <div class="receiver-sign">
                        <div style="font-weight: 800; margin-bottom: 5px;">Receiver's Signature:</div>
                        <div style="position: absolute; bottom: 8px; left: 8px; color: #666; font-size: 7.5pt;">Certified that goods received in good condition.</div>
                    </div>
                    <div class="authorizer-sign">
                        <div style="font-weight: 800; font-size: 9.5pt;">For ${company.companyName}</div>
                        <div style="position: absolute; bottom: 8px; left: 0; right: 0; font-weight: 900; font-size: 9pt;">Authorized Signatory</div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 7pt; color: #777; margin-top: 5px;">Page 1 of 1</div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0', right: '0', bottom: '0', left: '0' }
            });
            return pdfBuffer;
        } finally {
            await browser.close();
        }
    }
}

export default PDFService;
