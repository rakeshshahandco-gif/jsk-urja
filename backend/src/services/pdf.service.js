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
     */
    static async generateDocumentPDF(docData, company, type, user) {
        const isSO = type === 'Sales Order';
        const isPO = type === 'Purchase Order';
        const isSI = type === 'Sales Invoice';

        // Choose the template logic
        if (isPO) {
            return this.generatePurchaseOrderPDF(docData, company, user);
        }
        if (isSO) {
            return this.generateSalesOrderPDF(docData, company, user);
        }
        if (isSI) {
            return this.generateSalesInvoicePDF(docData, company, user);
        }

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
                    * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
                                <td style="text-align: center; font-weight: 700;">${it.qty || it.orderedQty}</td>
                                <td style="text-align: right;">${Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 700;">${Number(it.taxableAmount || (it.qty * it.rate) || (it.orderedQty * it.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
                                        <td class="summary-label">+ IGST @ ${items[0]?.taxPercent || items[0]?.gstRate || 18}%</td>
                                        <td class="summary-value">₹ ${(docData.totalIgst || docData.taxTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ` : `
                                    <tr>
                                        <td class="summary-label">+ CGST @ ${(items[0]?.taxPercent || items[0]?.gstRate || 18) / 2}%</td>
                                        <td class="summary-value">₹ ${(docData.totalCgst || (docData.taxTotal / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                        <td class="summary-label">+ SGST @ ${(items[0]?.taxPercent || items[0]?.gstRate || 18) / 2}%</td>
                                        <td class="summary-value">₹ ${(docData.totalSgst || (docData.taxTotal / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
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

    /**
     * Generate Purchase Order PDF matching the Frontend "Print Layout" exactly.
     */
    static async generatePurchaseOrderPDF(po, company, user) {
        const logoBase64 = this.getLogoBase64();
        const items = po.items || [];
        
        const fnum = (n) => parseFloat((Number(n) || 0).toFixed(2));
        
        // Use stored totals from the PO object for consistency with CRM
        const itemTaxable = fnum(po.subTotal || items.reduce((s, i) => s + (i.orderedQty * i.rate), 0));
        const freight = fnum(po.freightAmount || 0);
        const freightGstRate = po.freightGstRate || (items.length > 0 ? items[0].taxPercent : 18);
        const freightTax = fnum(freight * freightGstRate / 100);

        const itemTax = fnum(po.taxTotal ? (po.taxTotal - freightTax) : items.reduce((s, i) => s + (i.orderedQty * i.rate * (i.taxPercent || 0) / 100), 0));
        const totalTaxable = fnum(itemTaxable + freight);
        const totalTax = fnum(itemTax + freightTax);
        const grandTotal = fnum(po.grandTotal || (totalTaxable + totalTax));
        const isIGST = po.gstType === 'IGST';

        const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
        const amountInWords = po.amountInWords || numberToWords(grandTotal);

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    
                    * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body { margin: 0; padding: 10mm; color: #000; background: #fff; font-size: 9pt; line-height: 1.3; width: 210mm; }
                    
                    .p-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                    .company-info { display: flex; gap: 20px; align-items: flex-start; }
                    .logo-img { max-height: 70px; max-width: 140px; object-fit: contain; }
                    .company-details h1 { margin: 0; font-size: 20pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; color: #000; }
                    .company-addr { font-size: 8.5pt; color: #000; margin-top: 4px; line-height: 1.4; font-weight: 400; max-width: 440px; }
                    
                    .po-meta { text-align: right; }
                    .po-title { font-size: 16pt; font-weight: 900; color: #64748b; margin-bottom: 0px; text-transform: uppercase; }
                    .po-id { font-size: 14pt; font-weight: 800; color: #334155; margin-bottom: 8px; }
                    .meta-table { border-collapse: collapse; float: right; font-size: 8.5pt; text-align: left; }
                    .meta-table td { padding: 2px 0; }
                    .meta-label { font-weight: 800; padding-right: 10px; border-right: 1px solid #000; }
                    .meta-value { padding-left: 10px; min-width: 80px; }

                    .bill-ship-row { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; margin-bottom: 20px; min-height: 120px; }
                    .address-box { padding: 12px; }
                    .box-border-right { border-right: 1px solid #000; }
                    .box-label { font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #666; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
                    .party-name { font-size: 12pt; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; color: #000; }
                    .party-addr { font-size: 9pt; line-height: 1.4; color: #000; white-space: pre-wrap; }
                    
                    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; margin-bottom: 20px; }
                    .meta-item { border-right: 1px solid #000; }
                    .meta-item:last-child { border-right: none; }
                    .meta-item-head { background: #f5f5f5; padding: 6px 10px; font-size: 8pt; font-weight: 800; border-bottom: 1px solid #000; text-transform: uppercase; }
                    .meta-item-body { padding: 6px 10px; font-size: 9.5pt; }

                    .items-table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 0; table-layout: fixed; }
                    .items-table th { border: 1px solid #000; padding: 8px 4px; font-size: 8pt; font-weight: 800; text-transform: uppercase; background: #f5f5f5; text-align: center; }
                    .items-table td { border: 1px solid #000; padding: 8px; font-size: 9pt; vertical-align: top; }
                    
                    .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; border: 1px solid #000; border-top: none; }
                    .footer-left { border-right: 1px solid #000; padding: 12px; }
                    .footer-right { padding: 0; }
                    .summary-table { width: 100%; border-collapse: collapse; }
                    .summary-table td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 9.5pt; }
                    .summary-label { font-weight: 700; text-align: right; text-transform: uppercase; font-size: 8pt; border-right: 1px solid #000; }
                    .summary-value { text-align: right; font-weight: 700; width: 110px; }
                    .grand-total-row { background: #f5f5f5; font-size: 12pt !important; }
                    .grand-total-row td { border-bottom: none !important; }
                    
                    .signatory-section { display: grid; grid-template-columns: 1.5fr 1fr; margin-top: 25px; gap: 30px; }
                    .terms-box { font-size: 8pt; line-height: 1.5; color: #333; }
                    .terms-title { font-weight: 800; text-decoration: underline; margin-bottom: 6px; text-transform: uppercase; }
                    .signatory-box { border: 1px solid #000; display: flex; flex-direction: column; height: 130px; width: 230px; }
                    .signatory-head { background: #f5f5f5; padding: 5px; font-size: 8.5pt; font-weight: 800; text-align: center; border-bottom: 1px solid #000; }
                    .signatory-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 12px; }
                    .signatory-label { width: 170px; border-top: 1px solid #000; margin-top: 4px; padding-top: 2px; font-size: 8pt; font-weight: 800; text-align: center; }

                    @page { margin: 0; size: A4 portrait; }
                </style>
            </head>
            <body>
                <div class="p-header">
                    <div class="company-info">
                        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                        <div class="company-details">
                            <h1>${company.companyName}</h1>
                            <div class="company-addr">
                                ${company.address}<br/>
                                ${company.city}, ${company.state} - ${company.pincode}<br/>
                                Phone: ${company.phone} | Email: ${company.email}<br/>
                                <strong>GSTIN: ${company.gstNumber}</strong> ${company.panNumber ? ` | <strong>PAN:</strong> ${company.panNumber}` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="po-meta">
                        <div class="po-title">PURCHASE ORDER</div>
                        <div class="po-id">${po.poNumber}</div>
                        <table class="meta-table">
                            <tr><td class="meta-label">PO DATE</td><td class="meta-value">${fmt(po.poDate)}</td></tr>
                            <tr><td class="meta-label">DUE DATE</td><td class="meta-value">${fmt(po.expectedDeliveryDate)}</td></tr>
                        </table>
                    </div>
                </div>

                <div class="bill-ship-row">
                    <div class="address-box box-border-right">
                        <div class="box-label">VENDORS / SUPPLIER</div>
                        <div class="party-name">${po.supplierName || po.supplierId?.supplierName}</div>
                        <div class="party-addr">${po.supplierAddress || (po.supplierId?.address ? `${po.supplierId.address}, ${po.supplierId.city}, ${po.supplierId.state}` : '')}</div>
                        <div style="font-size: 9pt; margin-top: 8px;">
                            ${(po.supplierGstNumber || po.supplierId?.gstNumber) ? `<strong>GSTIN:</strong> ${po.supplierGstNumber || po.supplierId?.gstNumber}<br/>` : ''}
                            ${(po.supplierState || po.supplierId?.state) ? `<strong>State:</strong> ${po.supplierState || po.supplierId?.state}<br/>` : ''}
                            ${(po.supplierContact || po.supplierId?.phone) ? `<strong>Contact:</strong> ${po.supplierContact || po.supplierId?.phone}` : ''}
                        </div>
                    </div>
                    <div class="address-box">
                        <div class="box-label">DELIVER TO / SHIP TO</div>
                        <div class="party-name">${company.companyName}</div>
                        <div class="party-addr">
                            ${company.address}<br/>
                            ${company.city}, ${company.state} - ${company.pincode}
                        </div>
                        <div style="font-size: 9pt; margin-top: 8px;">
                            <strong>Contact:</strong> ${company.phone || ''}
                        </div>
                    </div>
                </div>

                <div class="meta-grid">
                    <div class="meta-item">
                        <div class="meta-item-head">Mode of Dispatch</div>
                        <div class="meta-item-body">${po.dispatchMode || 'By Road'}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-item-head">Terms of Payment</div>
                        <div class="meta-item-body">${po.paymentTerms || '—'}</div>
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 35px;">SR.</th>
                            <th>ITEM DESCRIPTION</th>
                            <th style="width: 80px;">HSN/SAC</th>
                            <th style="width: 50px;">QTY</th>
                            <th style="width: 50px;">UNIT</th>
                            <th style="width: 90px; text-align: right;">RATE</th>
                            <th style="width: 100px; text-align: right;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((it, i) => `
                            <tr>
                                <td style="text-align: center;">${i + 1}</td>
                                <td>
                                    <div style="font-weight: 800; font-size: 10.5pt; color: #000;">${it.itemName}</div>
                                    ${it.itemCode ? `<div style="font-size: 8pt; color: #444; margin-top: 1px;">Code: ${it.itemCode}</div>` : ''}
                                    ${it.description ? `<div style="font-size: 8.5pt; color: #555; margin-top: 3px; font-style: italic;">${it.description}</div>` : ''}
                                </td>
                                <td style="text-align: center;">${it.hsnCode || '—'}</td>
                                <td style="text-align: center; font-weight: 800;">${it.orderedQty}</td>
                                <td style="text-align: center;">${it.uom || 'NOS'}</td>
                                <td style="text-align: right;">${Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td style="text-align: right; font-weight: 800;">${Number(it.orderedQty * it.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="footer-grid">
                    <div class="footer-left">
                        <div style="font-size: 8.5pt; font-weight: 800; color: #666; margin-bottom: 2px;">AMOUNT IN WORDS:</div>
                        <div style="font-size: 10pt; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; color: #000;">${amountInWords}</div>
                        
                        ${po.remarks ? `
                            <div style="font-size: 8.5pt; font-weight: 800; color: #666; margin-bottom: 2px;">REMARKS / SPECIAL INSTRUCTIONS:</div>
                            <div style="font-size: 9pt; white-space: pre-wrap; color: #333;">${po.remarks}</div>
                        ` : ''}
                    </div>
                    <div class="footer-right">
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">TOTAL TAXABLE</td>
                                <td class="summary-value">${itemTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">FREIGHT / SHIPPING</td>
                                <td class="summary-value">${freight.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr style="background: #f5f5f5;">
                                <td class="summary-label" style="font-weight: 800;">TAXABLE AMOUNT</td>
                                <td class="summary-value" style="font-weight: 800;">${totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                            ${isIGST ? `
                                <tr>
                                    <td class="summary-label">IGST @ ${(items[0]?.taxPercent || 18)}%</td>
                                    <td class="summary-value">${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ` : `
                                <tr>
                                    <td class="summary-label">CGST @ ${(items[0]?.taxPercent || 18) / 2}%</td>
                                    <td class="summary-value">${(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                <tr>
                                    <td class="summary-label">SGST @ ${(items[0]?.taxPercent || 18) / 2}%</td>
                                    <td class="summary-value">${(totalTax / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            `}
                            <tr class="grand-total-row">
                                <td class="summary-label" style="font-weight: 900; color: #000; font-size: 11.5pt;">GRAND TOTAL</td>
                                <td class="summary-value" style="font-weight: 900; color: #000; font-size: 11.5pt;">₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div class="signatory-section">
                    <div class="terms-box">
                        <div class="terms-title">TERMS AND CONDITIONS:</div>
                        <ol style="margin: 0; padding-left: 18px; color: #333;">
                            <li>Materials must be supplied as per specifications mentioned above.</li>
                            <li>The PO number must be clearly mentioned on all invoices and delivery documents.</li>
                            <li>Materials are subject to quality checks and approval by our inspection team.</li>
                            <li>Payment terms are as per the agreed period from the date of receipt of material and correct invoice.</li>
                            <li>The company reserves the right to cancel the order if delivery is delayed beyond the expected date.</li>
                        </ol>
                    </div>
                    <div class="signatory-box">
                        <div class="signatory-head">For ${company.companyName}</div>
                        <div class="signatory-body">
                            <div style="font-weight: 800; text-transform: uppercase; font-size: 9.5pt;">${po.createdBy?.name || user?.name || ''}</div>
                            <div class="signatory-label">AUTHORIZED SIGNATORY</div>
                        </div>
                    </div>
                </div>
                <div style="text-align: right; font-size: 7.5pt; color: #999; margin-top: 15px;">This is a computer generated document. Page 1 of 1</div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
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
    /**
     * Generate Sales Order PDF matching the Frontend "Print Layout" exactly.
     */
    static async generateSalesOrderPDF(so, company, user) {
        const logoBase64 = this.getLogoBase64();
        const items = so.items || [];
        
        const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : "—";
        const grandTotal = so.roundedTotal || so.grandTotal || 0;
        const amountInWords = so.amountInWords || numberToWords(grandTotal);
        const gstApplicable = so.gstApplicable !== false;
        const isIGST = so.gstType === "IGST";
        
        // Multi-page logic matching frontend
        const itemsPerPageFirst = 7;
        const itemsPerPageOthers = 15;
        const pages = [];
        if (items.length <= itemsPerPageFirst) {
            pages.push(items);
        } else {
            pages.push(items.slice(0, itemsPerPageFirst));
            let remaining = items.slice(itemsPerPageFirst);
            while (remaining.length > 0) {
                pages.push(remaining.slice(0, itemsPerPageOthers));
                remaining = remaining.slice(itemsPerPageOthers);
            }
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    
                    * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body { margin: 0; padding: 0; color: #000; background: #fff; font-size: 9pt; line-height: 1.3; }
                    
                    .page { width: 210mm; min-height: 297mm; padding: 10mm; position: relative; display: flex; flex-direction: column; background: #fff; page-break-after: always; }
                    .page:last-child { page-break-after: auto; }
                    
                    .p-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
                    .company-info { display: flex; gap: 20px; align-items: flex-start; }
                    .logo-img { max-height: 80px; max-width: 120px; object-fit: contain; }
                    .company-details h1 { margin: 0; font-size: 20pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
                    .company-addr { font-size: 9pt; color: #000; line-height: 1.3; max-width: 450px; }
                    
                    .doc-meta { text-align: right; }
                    .doc-title { margin: 0 0 2px 0; font-size: 16pt; font-weight: 900; text-transform: uppercase; color: #64748b; }
                    .doc-id { font-size: 14pt; font-weight: 700; color: #334155; }

                    .info-block { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 20px; }
                    .party-info { flex: 1; }
                    .order-info { width: 300px; }
                    .info-table { width: 100%; border-collapse: collapse; }
                    .info-label { width: 120px; font-size: 10pt; font-weight: 800; padding: 4px 0; vertical-align: top; }
                    .info-value { font-size: 10pt; padding: 4px 0; vertical-align: top; text-transform: uppercase; }

                    .items-table { width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11px; margin-bottom: auto; }
                    .items-table th { border: 1px solid #000; padding: 8px 6px; font-weight: 800; background: #f5f5f5; text-align: center; text-transform: uppercase; }
                    .items-table td { border: 1px solid #000; padding: 6px; vertical-align: top; }

                    .summary-section { border: 1.5px solid #000; border-top: none; }
                    .summary-row { display: grid; grid-template-columns: 1.4fr 1fr; border-top: 1.5px solid #000; }
                    .summary-left { border-right: 1.5px solid #000; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; }
                    .summary-right { padding: 0; }
                    .summary-table { width: 100%; border-collapse: collapse; }
                    .summary-table td { padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 10pt; }
                    .total-label { font-weight: 400; }
                    .total-value { text-align: right; font-weight: 700; }
                    .grand-total-row { background: #f5f5f5; font-weight: 900; font-size: 11pt; }

                    .signatory-row { display: grid; grid-template-columns: 1fr 1fr; border: 1.5px solid #000; border-top: none; min-height: 120px; }
                    .receiver-sign { border-right: 1.5px solid #000; padding: 10px; font-size: 9pt; position: relative; }
                    .authorizer-sign { padding: 10px; text-align: center; position: relative; display: flex; flex-direction: column; justify-content: space-between; }

                    .continued-notice { padding: 8px; text-align: right; font-style: italic; font-size: 9pt; background: #fafafa; border: 1px solid #000; border-top: none; }
                    .page-counter { position: absolute; bottom: 5mm; right: 10mm; font-size: 8pt; color: #666; }

                    @page { margin: 0; size: A4 portrait; }
                </style>
            </head>
            <body>
                ${pages.map((pageItems, pageIdx) => {
                    const isFirstPage = pageIdx === 0;
                    const isLastPage = pageIdx === pages.length - 1;
                    const totalPages = pages.length;
                    return `
                        <div class="page">
                            <div class="page-counter">Page ${pageIdx + 1} of ${totalPages}</div>
                            
                            ${isFirstPage ? `
                                <div class="p-header">
                                    <div class="company-info">
                                        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                                        <div class="company-details">
                                            <h1>${company.companyName || "JSK URJA"}</h1>
                                            <div class="company-addr">
                                                ${company.address}<br />
                                                ${company.city} ${company.state}, India. Postal Code: ${company.pincode}. State Code: ${company.stateCode || ""}<br />
                                                ${(company.phone || company.email) ? `Phone: ${company.phone || ""} Email: ${company.email || ""}` : ""}<br />
                                                ${gstApplicable && company.gstNumber ? `<strong>GSTIN: ${company.gstNumber}</strong>` : ""}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="doc-meta">
                                        <h1 class="doc-title">${so.seriesId?.isEstimate ? "ESTIMATE" : "SALES ORDER"}</h1>
                                        ${!gstApplicable ? `<div style="font-size: 10pt; font-weight: 700;">(NON-GST)</div>` : ''}
                                        <div class="doc-id">${so.soNumber}</div>
                                    </div>
                                </div>
                                <div style="border-bottom: 2px solid #000; margin-bottom: 20px;"></div>

                                <div class="info-block">
                                    <div class="party-info">
                                        <table class="info-table">
                                            <tr><td class="info-label">Customer Name:</td><td class="info-value" style="font-weight: 900;">${so.customerName}</td></tr>
                                            <tr><td class="info-label">Address:</td><td class="info-value" style="font-size: 9pt;">${so.billingAddress || so.shippingAddress || "—"}</td></tr>
                                            ${(so.customerState) ? `<tr><td class="info-label">State:</td><td class="info-value">${so.customerState} ${so.customerStateCode ? `(${so.customerStateCode})` : ""}</td></tr>` : ''}
                                            ${so.customerPhone ? `<tr><td class="info-label">Contact No:</td><td class="info-value">${so.customerPhone}</td></tr>` : ''}
                                            ${gstApplicable && so.customerGstin ? `<tr><td class="info-label">GST No:</td><td class="info-value">${so.customerGstin}</td></tr>` : ''}
                                        </table>
                                    </div>
                                    <div class="order-info">
                                        <table class="info-table">
                                            <tr><td class="info-label">Date:</td><td class="info-value">${fmt(so.soDate)}</td></tr>
                                            <tr><td class="info-label">Order Category:</td><td class="info-value">${so.orderCategory || "Order"}</td></tr>
                                            <tr><td class="info-label">Delivery Date:</td><td class="info-value">${fmt(so.deliveryDate)}</td></tr>
                                            <tr><td class="info-label">Customer PO:</td><td class="info-value">${so.customerPO || "VERBAL"}</td></tr>
                                            <tr><td class="info-label">PO Date:</td><td class="info-value">${fmt(so.customerPODate || so.soDate)}</td></tr>
                                        </table>
                                    </div>
                                </div>
                            ` : `
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px;">
                                    <div style="font-size: 14pt; font-weight: 900; text-transform: uppercase;">${company.companyName || "JSK URJA"}</div>
                                    <div style="text-align: right; font-size: 9pt;">
                                        <strong>Order No:</strong> ${so.soNumber} | <strong>Date:</strong> ${fmt(so.soDate)}
                                    </div>
                                </div>
                            `}

                            <table class="items-table">
                                <thead>
                                    <tr>
                                        <th style="width: 35px;">SR</th>
                                        <th style="width: 85px; text-align: left;">ITEM CODE</th>
                                        <th style="text-align: left;">DESCRIPTION</th>
                                        <th style="width: 100px; text-align: left;">NOTES</th>
                                        <th style="width: 60px;">HSN</th>
                                        <th style="width: 60px;">QTY</th>
                                        <th style="width: 80px; text-align: right;">RATE</th>
                                        <th style="width: 100px; text-align: right;">AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pageItems.map((item, i) => {
                                        const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                                        return `
                                            <tr>
                                                <td style="text-align: center;">${srNo}</td>
                                                <td>${item.itemCode || "—"}</td>
                                                <td style="font-weight: 700; text-transform: uppercase;">${item.description || item.itemName}</td>
                                                <td style="font-size: 8pt;">${item.additionalNotes || "—"}</td>
                                                <td style="text-align: center; font-size: 8pt;">${item.hsnCode || "—"}</td>
                                                <td style="text-align: center; font-weight: 700;">${item.qty} ${item.uom}</td>
                                                <td style="text-align: right;">₹ ${Number(item.rate || 0).toFixed(2)}</td>
                                                <td style="text-align: right; font-weight: 700;">₹ ${Number(item.amount || item.qty * item.rate || 0).toFixed(2)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                            ${!isLastPage ? `<div class="continued-notice">Continued on next page...</div>` : ''}

                            ${isLastPage ? `
                                <div class="summary-section">
                                    <div class="summary-row">
                                        <div class="summary-left">
                                            <div>
                                                <div style="font-size: 8pt; font-weight: 800; color: #666; margin-bottom: 2px;">REMARKS:</div>
                                                <div style="font-size: 9pt; color: #333; font-style: italic;">${so.remarks || "—"}</div>
                                            </div>
                                            <div style="margin-top: 10px;">
                                                <div style="font-size: 8.5pt; font-weight: 800; color: #666; margin-bottom: 2px;">AMOUNT IN WORDS:</div>
                                                <div style="font-size: 10pt; font-weight: 900; text-transform: uppercase; color: #000;">${amountInWords} ONLY</div>
                                            </div>
                                        </div>
                                        <div class="summary-right">
                                            <table class="summary-table">
                                                <tr><td class="total-label">Total Before Tax</td><td class="total-value">₹ ${(so.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                ${gstApplicable ? (
                                                    isIGST ? `
                                                        <tr><td class="total-label">IGST Total</td><td class="total-value">₹ ${(so.totalIgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                    ` : `
                                                        <tr><td class="total-label">CGST Total</td><td class="total-value">₹ ${(so.totalCgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                        <tr><td class="total-label">SGST Total</td><td class="total-value">₹ ${(so.totalSgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                    `
                                                ) : ''}
                                                ${so.freightAmount ? `<tr><td class="total-label">Freight / Other</td><td class="total-value">₹ ${(so.freightAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
                                                <tr class="grand-total-row">
                                                    <td style="font-weight: 900; border: none;">Grand Total</td>
                                                    <td style="text-align: right; font-weight: 900; border: none;">₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                <div class="signatory-row">
                                    <div class="receiver-sign">
                                        <div style="font-weight: 900; text-decoration: underline;">Terms & Conditions:</div>
                                        <div style="font-size: 7.5pt; color: #333; margin-top: 4px; line-height: 1.4;">
                                            1. Material once dispatched will not be taken back.<br/>
                                            2. Standard warranty applies as per product category.<br/>
                                            3. All disputes are subject to MUMBAI Jurisdiction.<br/>
                                            4. This is a computer generated document.
                                        </div>
                                        <div style="position: absolute; bottom: 10px; left: 10px; width: 150px; border-top: 1px dashed #000; text-align: center; font-size: 8pt; font-weight: 800; padding-top: 4px;">RECEIVER'S SIGNATURE</div>
                                    </div>
                                    <div class="authorizer-sign">
                                        <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase;">For ${company.companyName}</div>
                                        <div style="margin-bottom: 5px;">
                                            <div style="font-weight: 800; font-size: 9.5pt; text-transform: uppercase;">${so.createdBy?.fullName || so.createdBy?.name || user?.name || ''}</div>
                                            <div style="width: 180px; border-top: 1.5px solid #000; margin: 5px auto 0; padding-top: 2px; font-size: 8.5pt; font-weight: 900;">AUTHORIZED SIGNATORY</div>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
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
    /**
     * Generate High-Fidelity Sales Invoice PDF matching the Frontend layout.
     */
    static async generateSalesInvoicePDF(inv, company, user) {
        const logoBase64 = this.getLogoBase64();
        let barcodeBlockHtml = '';
        try {
            const { buildInvoiceBarcodePayload } = await import('./invoiceBarcode.service.js');
            const companyId = inv.companyId || company?.companyId;
            const bc = await buildInvoiceBarcodePayload(inv, companyId);
            if (bc.settings?.enableQr || bc.settings?.enableBarcode) {
                const bcPart = bc.settings.enableBarcode && bc.barcodeDataUrl
                    ? `<div style="text-align:center;"><img src="${bc.barcodeDataUrl}" alt="Barcode" style="height:${bc.settings.barcodeHeight || 40}px;max-width:220px;" /><div style="font-size:7pt;margin-top:2px;">${bc.barcodeValue || ""}</div></div>`
                    : '';
                const qrPart = bc.settings.enableQr && bc.qrDataUrl
                    ? `<div style="text-align:center;"><img src="${bc.qrDataUrl}" alt="QR" style="width:${bc.settings.qrSize || 96}px;height:${bc.settings.qrSize || 96}px;" /><div style="font-size:7pt;margin-top:2px;">Scan for details</div>`
                    : '';
                barcodeBlockHtml = `<div class="barcode-footer" style="display:flex;justify-content:flex-end;align-items:flex-end;gap:16px;margin-top:8px;padding:8px 0;border-top:1px dashed #ccc;">${bcPart}${qrPart}</div>`;
            }
        } catch (bcErr) {
            console.warn('[PDF] Invoice barcode skipped:', bcErr.message);
        }
        const items = inv.items || [];
        
        const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : "—";
        const grandTotal = inv.roundedTotal || inv.grandTotal || 0;
        const amountInWords = inv.amountInWords || numberToWords(grandTotal);
        const gstApplicable = inv.gstApplicable !== false;
        const isIGST = inv.gstType === "IGST";
        const isEstimate = inv.seriesId?.isEstimate === true;

        // Multi-page logic matching frontend
        const itemsPerPageFirst = 8;
        const itemsPerPageOthers = 20;
        const pages = [];
        if (items.length <= itemsPerPageFirst) {
            pages.push(items);
        } else {
            pages.push(items.slice(0, itemsPerPageFirst));
            let remaining = items.slice(itemsPerPageFirst);
            while (remaining.length > 0) {
                pages.push(remaining.slice(0, itemsPerPageOthers));
                remaining = remaining.slice(itemsPerPageOthers);
            }
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    
                    * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body { margin: 0; padding: 0; color: #000; background: #fff; font-size: 9pt; line-height: 1.3; }
                    
                    .page { width: 210mm; min-height: 297mm; padding: 10mm; position: relative; display: flex; flex-direction: column; background: #fff; page-break-after: always; }
                    .page:last-child { page-break-after: auto; }
                    
                    .p-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
                    .company-info { display: flex; gap: 15px; align-items: flex-start; }
                    .logo-img { max-height: 60px; max-width: 150px; object-fit: contain; }
                    .company-details h1 { margin: 0; font-size: 18pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
                    .company-addr { font-size: 8.5pt; color: #000; line-height: 1.2; max-width: 400px; }
                    
                    .doc-meta { text-align: right; }
                    .doc-title-box { font-size: 16pt; font-weight: 900; color: #000; border: 2px solid #000; padding: 2px 10px; display: inline-block; margin-bottom: 5px; }
                    .doc-number { font-size: 10pt; font-weight: 700; }

                    .ref-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-bottom: none; }
                    .ref-item { padding: 6px; font-size: 8pt; border-right: 1px solid #000; }
                    .ref-item:last-child { border-right: none; }
                    .ref-label { color: #555; width: 110px; display: inline-block; }
                    .ref-value { font-weight: 700; }

                    .parties-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-bottom: none; }
                    .party-box { padding: 8px; border-right: 1px solid #000; }
                    .party-box:last-child { border-right: none; }
                    .party-label { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 4px; }
                    .party-name { font-size: 10pt; font-weight: 900; }
                    .party-addr { font-size: 9pt; white-space: pre-wrap; margin-bottom: 4px; }

                    .items-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
                    .items-table th { border: 1px solid #000; padding: 6px 2px; font-size: 8pt; background: #f5f5f5; font-weight: 800; text-transform: uppercase; }
                    .items-table td { border: 1px solid #000; padding: 6px; vertical-align: top; font-size: 9pt; }

                    .summary-section { margin-top: 10px; border: 1px solid #000; display: grid; grid-template-columns: 1.4fr 1fr; }
                    .summary-left { border-right: 1px solid #000; padding: 8px; }
                    .summary-right { padding: 0; }
                    .summary-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    .summary-table td { padding: 4px 8px; border-bottom: 1px solid #eee; }
                    .grand-total-row { background: #f5f5f5; font-weight: 900; font-size: 11pt; }

                    .authorizer-row { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-top: none; height: 90px; }
                    .receiver-box { border-right: 1px solid #000; padding: 8px; position: relative; }
                    .authorizer-box { padding: 8px; text-align: center; position: relative; }

                    .cancelled-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 100pt; font-weight: 900; color: rgba(239, 68, 68, 0.15); border: 15px solid rgba(239, 68, 68, 0.15); padding: 20px 50px; border-radius: 20px; text-transform: uppercase; z-index: 100; pointer-events: none; }
                    .page-counter { position: absolute; bottom: 5mm; right: 10mm; font-size: 8pt; color: #666; }

                    @page { margin: 0; size: A4 portrait; }
                </style>
            </head>
            <body>
                ${pages.map((pageItems, pageIdx) => {
                    const isFirstPage = pageIdx === 0;
                    const isLastPage = pageIdx === pages.length - 1;
                    const totalPages = pages.length;
                    return `
                        <div class="page">
                            <div class="page-counter">Page ${pageIdx + 1} of ${totalPages}</div>
                            
                            ${isFirstPage ? `
                                <div class="p-header">
                                    <div class="company-info">
                                        ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                                        <div class="company-details">
                                            <h1>${company.companyName}</h1>
                                            <div class="company-addr">
                                                ${company.address}, ${company.city} - ${company.pincode}, ${company.state} (Code: ${company.stateCode})<br />
                                                ${company.phone && `Contact: ${company.phone}`} ${company.email && ` | Email: ${company.email}`}<br />
                                                ${gstApplicable && company.gstNumber ? `<strong>GSTIN: ${company.gstNumber}</strong> | ` : ""}
                                                ${company.panNumber ? `PAN: ${company.panNumber}` : ""}<br />
                                                ${company.cin ? `CIN: ${company.cin} | ` : ""}
                                                ${company.urn ? `MSME/URN: ${company.urn}` : ""}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="doc-meta">
                                        <div class="doc-title-box">${isEstimate ? 'ESTIMATE' : (gstApplicable ? 'TAX INVOICE' : 'SALES INVOICE')}</div>
                                        <div class="doc-number">Invoice No: ${inv.invoiceNumber}</div>
                                        <div style="font-size: 10pt; font-weight: 600;">Date: ${fmt(inv.invoiceDate)}</div>
                                    </div>
                                </div>

                                <div class="ref-grid">
                                    <div class="ref-item"><span class="ref-label">Sales Order No:</span><span class="ref-value">${inv.soNumber || '—'}</span></div>
                                    <div class="ref-item"><span class="ref-label">Place of Supply:</span><span class="ref-value">${inv.placeOfSupply || inv.billingState || '—'}</span></div>
                                </div>
                                <div class="ref-grid" style="border-top: none;">
                                    <div class="ref-item"><span class="ref-label">Buyer Order No:</span><span class="ref-value">${inv.buyerOrderNo || '—'}</span></div>
                                    <div class="ref-item"><span class="ref-label">Payment Term:</span><span class="ref-value">${inv.paymentTerms || '—'}</span></div>
                                </div>
                                <div class="ref-grid" style="border-top: none;">
                                    <div class="ref-item"><span class="ref-label">Dispatch Through:</span><span class="ref-value">${inv.dispatchThrough || '—'}</span></div>
                                    <div class="ref-item"><span class="ref-label">Buyer Order Date:</span><span class="ref-value">${inv.buyerOrderDate ? fmt(inv.buyerOrderDate) : '—'}</span></div>
                                </div>

                                <div class="parties-grid">
                                    <div class="party-box">
                                        <div class="party-label">Bill To (Buyer):</div>
                                        <div class="party-name">${inv.customerName}</div>
                                        <div class="party-addr">${inv.billingAddress}</div>
                                        <div style="font-size: 8pt;">
                                            ${inv.customerGstin ? `<div><strong>GSTIN:</strong> ${inv.customerGstin}</div>` : ""}
                                            <div><strong>State:</strong> ${inv.billingState} (${inv.billingStateCode})</div>
                                        </div>
                                    </div>
                                    <div class="party-box">
                                        <div class="party-label">Ship To (Consignee):</div>
                                        <div class="party-name">${inv.customerName}</div>
                                        <div class="party-addr">${inv.shippingAddress || inv.billingAddress}</div>
                                        <div style="font-size: 8pt;">
                                            ${(inv.shippingGstin || inv.customerGstin) ? `<div><strong>GSTIN:</strong> ${inv.shippingGstin || inv.customerGstin}</div>` : ""}
                                            <div><strong>State:</strong> ${inv.shippingState || inv.billingState} (${inv.shippingStateCode || inv.billingStateCode})</div>
                                        </div>
                                    </div>
                                </div>
                            ` : `
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px;">
                                    <div style="font-size: 14pt; font-weight: 900; text-transform: uppercase;">${company.companyName}</div>
                                    <div style="text-align: right; font-size: 9pt;">
                                        <strong>Invoice No:</strong> ${inv.invoiceNumber} | <strong>Date:</strong> ${fmt(inv.invoiceDate)}
                                    </div>
                                </div>
                            `}

                            <div style="flex: 1;">
                                <table class="items-table">
                                    <thead>
                                        <tr style="background: #f5f5f5;">
                                            <th style="width: 35px;">SR</th>
                                            <th style="text-align: left; padding-left: 8px;">ITEM DESCRIPTION</th>
                                            <th style="width: 70px;">HSN/SAC</th>
                                            <th style="width: 45px;">UOM</th>
                                            <th style="width: 50px;">QTY</th>
                                            <th style="width: 90px; text-align: right; padding-right: 8px;">RATE</th>
                                            <th style="width: 100px; text-align: right; padding-right: 8px;">AMOUNT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${pageItems.map((it, i) => {
                                            const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                                            return `
                                                <tr>
                                                    <td style="text-align: center;">${srNo}</td>
                                                    <td>
                                                        <div style="font-weight: 700; text-transform: uppercase;">${it.description || it.itemName}</div>
                                                        ${(it.additionalNotes || it.itemCode) ? `<div style="font-size: 8pt; color: #444; margin-top: 2px;">${it.itemCode ? `Code: ${it.itemCode} ` : ""}${it.additionalNotes ? `| ${it.additionalNotes}` : ""}</div>` : ""}
                                                    </td>
                                                    <td style="text-align: center;">${it.hsnCode || '—'}</td>
                                                    <td style="text-align: center;">${it.uom || 'NOS'}</td>
                                                    <td style="text-align: center; font-weight: 700;">${it.qty}</td>
                                                    <td style="text-align: right;">${Number(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td style="text-align: right; font-weight: 700;">${Number(it.taxableAmount || (it.qty * it.rate) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            `;
                                        }).join('')}
                                        ${!isLastPage ? `<tr><td colspan="7" style="text-align: right; font-style: italic; background: #fafafa;">Continued on next page...</td></tr>` : ""}
                                    </tbody>
                                </table>
                            </div>

                            ${isLastPage ? `
                                <div class="summary-section">
                                    <div class="summary-left">
                                        <div style="margin-bottom: 8px;">
                                            <div style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #555; border-bottom: 1px solid #eee; padding-bottom: 2px; margin-bottom: 4px;">Bank Details:</div>
                                            <div style="font-size: 8.5pt; line-height: 1.3;">
                                                <strong>${company.bankName || 'BANK OF BARODA'}</strong><br />
                                                Account Name: {company.companyName}<br />
                                                Account No: ${company.accountNo || '—'}<br />
                                                IFSC Code: ${company.ifscCode || '—'} | Branch: ${company.branchName || '—'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #555; border-bottom: 1px solid #eee; padding-bottom: 2px; margin-bottom: 4px;">Terms & Declaration:</div>
                                            <div style="font-size: 7.5pt; color: #333; line-height: 1.2;">
                                                1. Goods once sold will not be taken back.<br />
                                                2. Subject to MUMBAI Jurisdiction.<br />
                                                3. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                                            </div>
                                        </div>
                                    </div>
                                    <div class="summary-right">
                                        <table class="summary-table">
                                            <tr><td>Total Taxable Value</td><td style="text-align: right; font-weight: 700;">₹ ${(inv.totalTaxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                            ${gstApplicable ? (
                                                isIGST ? `
                                                    <tr><td>+ IGST @ ${inv.items?.[0]?.taxRate || 18}%</td><td style="text-align: right;">₹ ${(inv.totalIgst || inv.totalTaxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                ` : `
                                                    <tr><td>+ CGST @ ${(inv.items?.[0]?.taxRate || 18) / 2}%</td><td style="text-align: right;">₹ ${(inv.totalCgst || (inv.totalTaxAmount / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                    <tr><td>+ SGST @ ${(inv.items?.[0]?.taxRate || 18) / 2}%</td><td style="text-align: right;">₹ ${(inv.totalSgst || (inv.totalTaxAmount / 2) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
                                                `
                                            ) : ''}
                                            ${Number(inv.freightAmount || 0) > 0 ? `<tr><td>+ Freight / Shipping</td><td style="text-align: right;">₹ ${Number(inv.freightAmount).toFixed(2)}</td></tr>` : ""}
                                            ${inv.roundOff !== 0 ? `<tr><td>Round Off</td><td style="text-align: right;">${Number(inv.roundOff).toFixed(2)}</td></tr>` : ""}
                                            <tr class="grand-total-row">
                                                <td style="font-weight: 900;">Grand Total</td>
                                                <td style="text-align: right; font-weight: 900;">₹ ${(inv.roundedTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        </table>
                                    </div>
                                </div>
                                <div style="border: 1px solid #000; border-top: none; padding: 6px 8px; font-size: 9pt; background: #fafafa;">
                                    <span style="font-weight: 800; text-transform: uppercase; margin-right: 5px;">Amount in Words:</span>
                                    <span style="font-weight: 900; text-transform: capitalize;">${amountInWords} ONLY</span>
                                </div>
                                ${barcodeBlockHtml}<div class="authorizer-row">
                                    <div class="receiver-box">
                                        <div style="font-weight: 900; margin-bottom: 4px;">Receiver's Signature:</div>
                                        <div style="position: absolute; bottom: 8px; left: 8px; font-size: 7pt; color: #666;">Checked and Received in Good Condition</div>
                                    </div>
                                    <div class="authorizer-box">
                                        <div style="font-size: 9pt; font-weight: 800;">For ${company.companyName}</div>
                                        <div style="position: absolute; bottom: 8px; left: 0; right: 0; font-size: 9pt; font-weight: 900;">AUTHORIZED SIGNATORY</div>
                                    </div>
                                </div>
                            ` : ''}

                            ${inv.status === 'Cancelled' ? `<div class="cancelled-watermark">CANCELLED</div>` : ""}
                        </div>
                    `;
                }).join('')}
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
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

    /**
     * Generate High-Fidelity Bill of Material (BOM) PDF.
     * Supports both Full (with costing) and Technical (no costing) modes.
     */
    static async generateBOMPDF(bom, company, includeCost = true) {
        const logoBase64 = this.getLogoBase64();
        const items = bom.components || [];
        const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const dateFmt = (d) => d ? new Date(d).toLocaleDateString('en-GB') : "—";
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    
                    * { box-sizing: border-box; font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    body { margin: 0; padding: 0; color: #000; background: #fff; font-size: 9pt; line-height: 1.3; }
                    
                    .page { width: 210mm; min-height: 297mm; padding: 12mm; position: relative; display: flex; flex-direction: column; background: #fff; }
                    
                    .p-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
                    .company-info { display: flex; gap: 15px; align-items: flex-start; }
                    .logo-img { max-height: 60px; max-width: 150px; object-fit: contain; }
                    .company-details h1 { margin: 0; font-size: 18pt; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
                    .company-addr { font-size: 8.5pt; color: #000; line-height: 1.2; max-width: 400px; }
                    
                    .doc-meta { text-align: right; }
                    .doc-title-box { font-size: 16pt; font-weight: 900; color: #000; border: 2px solid #000; padding: 2px 10px; display: inline-block; margin-bottom: 5px; text-transform: uppercase; }
                    .doc-number { font-size: 11pt; font-weight: 700; color: #1e40af; }

                    .bom-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; border: 1.5px solid #000; background: #000; margin-bottom: 20px; }
                    .bom-item { background: #fff; padding: 8px; }
                    .bom-label { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
                    .bom-value { font-size: 9.5pt; font-weight: 700; color: #000; }

                    .items-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
                    .items-table th { border: 1px solid #000; padding: 7px 4px; font-size: 8pt; background: #f1f5f9; font-weight: 900; text-transform: uppercase; }
                    .items-table td { border: 1px solid #000; padding: 7px; vertical-align: top; font-size: 9pt; }
                    
                    .summary-section { margin-top: 15px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; }
                    .cost-card { border: 1.5px solid #000; border-radius: 4px; overflow: hidden; }
                    .cost-header { background: #000; color: #fff; padding: 5px 10px; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; text-align: center; }
                    .cost-table { width: 100%; border-collapse: collapse; }
                    .cost-table td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 9pt; }
                    .cost-label { color: #444; }
                    .cost-value { text-align: right; font-weight: 700; }
                    .final-cost-row { background: #f8fafc; font-weight: 900 !important; font-size: 11pt !important; border-top: 1.5px solid #000; }

                    .footer-notes { font-size: 8.5pt; line-height: 1.4; color: #334155; }
                    .signatory-row { margin-top: 50px; display: flex; justify-content: space-between; padding: 0 40px; }
                    .sign-box { text-align: center; width: 160px; }
                    .sign-line { border-top: 1.5px solid #000; margin-bottom: 5px; }
                    .sign-text { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; }

                    @page { margin: 0; size: A4 portrait; }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="p-header">
                        <div class="company-info">
                            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" />` : ''}
                            <div class="company-details">
                                <h1>${company.companyName}</h1>
                                <div class="company-addr">
                                    ${company.address}, ${company.city} - ${company.pincode}, ${company.state}<br />
                                    ${company.phone && `Contact: ${company.phone}`} ${company.email && ` | Email: ${company.email}`}<br />
                                    ${company.gstNumber ? `<strong>GSTIN: ${company.gstNumber}</strong>` : ""}
                                </div>
                            </div>
                        </div>
                        <div class="doc-meta">
                            <div class="doc-title-box">Bill of Material</div>
                            <div class="doc-number">BOM #: ${bom.bomNumber}</div>
                            <div style="font-size: 9pt; font-weight: 600; margin-top: 2px;">Version: ${bom.version}</div>
                        </div>
                    </div>

                    <div class="bom-grid">
                        <div class="bom-item" style="grid-column: span 2;">
                            <div class="bom-label">Finished Product</div>
                            <div class="bom-value">${bom.finishedProductId?.itemName || "—"}</div>
                            <div style="font-size: 7.5pt; color: #64748b; font-family: monospace;">Code: ${bom.finishedProductId?.itemCode || "—"}</div>
                        </div>
                        <div class="bom-item">
                            <div class="bom-label">BOM Type</div>
                            <div class="bom-value">${bom.bomType}</div>
                        </div>
                        <div class="bom-item">
                            <div class="bom-label">Revision Date</div>
                            <div class="bom-value">${dateFmt(bom.revisionDate)}</div>
                        </div>
                        <div class="bom-item">
                            <div class="bom-label">Prod. Quantity</div>
                            <div class="bom-value">${bom.productionQuantity} ${bom.finishedProductId?.uom || "NOS"}</div>
                        </div>
                        <div class="bom-item">
                            <div class="bom-label">Status</div>
                            <div class="bom-value" style="color: ${bom.status === 'Approved' ? '#16a34a' : (bom.status === 'Draft' ? '#d97706' : '#64748b')}">${bom.status}</div>
                        </div>
                        <div class="bom-item" style="grid-column: span 2;">
                            <div class="bom-label">Is Default BOM</div>
                            <div class="bom-value">${bom.isDefault ? "YES" : "NO"}</div>
                        </div>
                    </div>

                    <table class="items-table">
                        <thead>
                            <tr>
                                <th style="width: 35px;">SR</th>
                                <th style="text-align: left; padding-left: 8px;">COMPONENT DETAILS</th>
                                <th style="width: 60px;">TYPE</th>
                                <th style="width: 55px;">QTY</th>
                                <th style="width: 50px;">UOM</th>
                                ${includeCost ? `
                                    <th style="width: 85px; text-align: right; padding-right: 8px;">RATE</th>
                                    <th style="width: 95px; text-align: right; padding-right: 8px;">TOTAL</th>
                                ` : ''}
                                <th style="width: 50px;">PTS</th>
                                <th style="text-align: left; padding-left: 8px;">REMARK / LOC</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((it, i) => `
                                <tr>
                                    <td style="text-align: center; color: #64748b; font-weight: 700;">${i + 1}</td>
                                    <td>
                                        <div style="font-weight: 800; text-transform: uppercase;">${it.itemName}</div>
                                        <div style="font-size: 7.5pt; color: #64748b; margin-top: 1px; font-family: monospace;">${it.itemCode}</div>
                                    </td>
                                    <td style="text-align: center; font-weight: 700; font-size: 8pt; color: #1e40af;">${it.componentType || "—"}</td>
                                    <td style="text-align: center; font-weight: 900;">${it.quantity}</td>
                                    <td style="text-align: center; font-size: 8pt; color: #64748b;">${it.uom || "NOS"}</td>
                                    ${includeCost ? `
                                        <td style="text-align: right;">${fmt(it.rate)}</td>
                                        <td style="text-align: right; font-weight: 700;">₹ ${fmt(it.totalCost)}</td>
                                    ` : ''}
                                    <td style="text-align: center; font-weight: 700; color: #b45309;">${it.points || 0}</td>
                                    <td style="font-size: 8pt; color: #475569;">${it.remarks || "—"}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="summary-section">
                        <div class="footer-notes">
                            <div style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 6px;">BOM Remarks / Instructions:</div>
                            <div style="white-space: pre-wrap; font-style: italic;">${bom.remarks || "No additional remarks."}</div>
                            
                            <div style="margin-top: 20px;">
                                <div style="font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #64748b; padding-bottom: 3px; margin-bottom: 6px;">Manufacturing Flow:</div>
                                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                    ${Object.entries(bom.processes || {}).filter(([_, v]) => v).map(([k, _]) => `
                                        <div style="background: #f1f5f9; padding: 4px 10px; border-radius: 4px; font-size: 7.5pt; font-weight: 800; border: 1px solid #e2e8f0; text-transform: capitalize;">
                                            ${k.replace(/([A-Z])/g, ' $1').trim()}
                                        </div>
                                    `).join('') || '<div style="font-size: 8pt; opacity: 0.6;">No specific processes defined.</div>'}
                                </div>
                            </div>
                        </div>

                        ${includeCost ? `
                            <div class="cost-card">
                                <div class="cost-header">BOM Costing Summary</div>
                                <table class="cost-table">
                                    <tr>
                                        <td class="cost-label">Total Raw Material Cost</td>
                                        <td class="cost-value">₹ ${fmt(bom.totalRawMaterialCost)}</td>
                                    </tr>
                                    <tr>
                                        <td class="cost-label">Component Labour (Points)</td>
                                        <td class="cost-value">₹ ${fmt(bom.totalPointsLabourCost)}</td>
                                    </tr>
                                    ${bom.totalProcessCost ? `<tr><td class="cost-label">Processing Cost</td><td class="cost-value">₹ ${fmt(bom.totalProcessCost)}</td></tr>` : ''}
                                    ${bom.overheadCost ? `<tr><td class="cost-label">Overhead Cost</td><td class="cost-value">₹ ${fmt(bom.overheadCost)}</td></tr>` : ''}
                                    ${bom.labourCost ? `<tr><td class="cost-label">Other Labour Cost</td><td class="cost-value">₹ ${fmt(bom.labourCost)}</td></tr>` : ''}
                                    <tr class="final-cost-row">
                                        <td style="font-weight: 900;">Final Cost Per Unit</td>
                                        <td style="text-align: right; font-weight: 900; color: #1e40af;">₹ ${fmt(bom.finalProductionCostPerUnit)}</td>
                                    </tr>
                                </table>
                            </div>
                        ` : `
                            <div style="border: 1.5px dashed #e2e8f0; padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                                <div style="font-size: 20pt; opacity: 0.2;">📄</div>
                                <div style="font-size: 9pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Technical Specification Only</div>
                                <div style="font-size: 7.5pt; color: #cbd5e1;">Costing details removed as per request.</div>
                            </div>
                        `}
                    </div>

                    <div class="signatory-row">
                        <div class="sign-box">
                            <div class="sign-line"></div>
                            <div class="sign-text">Prepared By</div>
                        </div>
                        <div class="sign-box">
                            <div class="sign-line"></div>
                            <div class="sign-text">Production Head</div>
                        </div>
                        <div class="sign-box">
                            <div class="sign-line"></div>
                            <div class="sign-text">Authorized By</div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; font-size: 7.5pt; color: #94a3b8; margin-top: auto; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                        This is a computer generated specification document. <strong>${company.companyName}</strong>
                    </div>
                </div>
            </body>
            </html>
        `;

        const browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        try {
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
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
