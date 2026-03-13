import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import EmailService from '../services/email.service.js';
import CommunicationLog from '../models/communicationLog.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import WhatsAppAutomationService from '../services/whatsapp.automation.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import PDFDocument from 'pdfkit';

// ── Pure-JS PDF generator using pdfkit (no Chrome/Puppeteer needed) ──────────
const generateOrderPDF = (order, company, type) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const isSOType = type === 'Sales Order';
        const docNumber = isSOType ? order.soNumber : order.poNumber;
        const docDate = isSOType ? order.soDate : order.poDate;
        const partyName = isSOType
            ? order.customerName
            : (order.supplierName || order.supplierId?.supplierName || 'Supplier');
        const orderItems = order.items || [];

        // ── Header ────────────────────────────────────────────────────────────
        doc.fontSize(20).font('Helvetica-Bold').text(company.companyName || 'JSK URJA', 40, 40);
        doc.fontSize(8).font('Helvetica').fillColor('#555').text(
            [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', '),
            40, 65
        );
        if (company.phone) doc.text(`Phone: ${company.phone}  |  Email: ${company.email || ''}`, 40, 75);
        if (company.gstNumber) doc.font('Helvetica-Bold').text(`GSTIN: ${company.gstNumber}`, 40, 85);

        // ── Title ────────────────────────────────────────────────────────────
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#334155')
            .text(type.toUpperCase(), 0, 40, { align: 'right', width: doc.page.width - 40 });
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e293b')
            .text(docNumber, 0, 60, { align: 'right', width: doc.page.width - 40 });
        doc.fontSize(9).font('Helvetica').fillColor('#555')
            .text(`Date: ${docDate ? new Date(docDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}`, 0, 75, { align: 'right', width: doc.page.width - 40 });

        // ── Divider ──────────────────────────────────────────────────────────
        doc.moveTo(40, 105).lineTo(doc.page.width - 40, 105).strokeColor('#000').lineWidth(1).stroke();
        doc.moveDown(0.3);

        // ── Party Info ───────────────────────────────────────────────────────
        const partyY = 115;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text('BILL TO:', 40, partyY);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text(partyName, 40, partyY + 12);
        if (isSOType && order.billingAddress) {
            doc.fontSize(9).font('Helvetica').fillColor('#555').text(order.billingAddress, 40, partyY + 26, { width: 250 });
        } else if (!isSOType && order.supplierAddress) {
            doc.fontSize(9).font('Helvetica').fillColor('#555').text(order.supplierAddress, 40, partyY + 26, { width: 250 });
        }

        // ── Table Header ─────────────────────────────────────────────────────
        const tableStartY = 185;
        const cols = { sr: 40, item: 65, hsn: 290, qty: 350, rate: 405, amount: 470 };
        const tableW = doc.page.width - 80;

        doc.rect(40, tableStartY - 5, tableW, 20).fill('#f1f5f9');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
        doc.text('#', cols.sr, tableStartY, { width: 20, align: 'center' });
        doc.text('Item Description', cols.item, tableStartY, { width: 220 });
        doc.text('HSN', cols.hsn, tableStartY, { width: 55, align: 'center' });
        doc.text('Qty', cols.qty, tableStartY, { width: 50, align: 'center' });
        doc.text('Rate', cols.rate, tableStartY, { width: 60, align: 'right' });
        doc.text('Amount', cols.amount, tableStartY, { width: 70, align: 'right' });

        // ── Table Rows ───────────────────────────────────────────────────────
        let rowY = tableStartY + 20;
        doc.font('Helvetica').fontSize(9).fillColor('#1e293b');

        orderItems.forEach((item, i) => {
            if (rowY > doc.page.height - 120) {
                doc.addPage();
                rowY = 50;
            }
            if (i % 2 === 0) doc.rect(40, rowY - 3, tableW, 18).fill('#fafafa').stroke('#f1f5f9');
            doc.fillColor('#374151');
            doc.text(String(i + 1), cols.sr, rowY, { width: 20, align: 'center' });
            const itemName = item.itemName || item.description || '';
            const itemCode = item.itemCode ? `(${item.itemCode})` : '';
            doc.font('Helvetica-Bold').text(itemName, cols.item, rowY, { width: 220, lineBreak: false });
            if (itemCode) {
                doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
                    .text(itemCode, cols.item, rowY + 9, { width: 220 });
            }
            const qty = item.qty || item.orderedQty || 0;
            const rate = item.rate || 0;
            const amount = qty * rate;
            doc.font('Helvetica').fontSize(9).fillColor('#374151');
            doc.text(item.hsnCode || '—', cols.hsn, rowY, { width: 55, align: 'center' });
            doc.text(`${qty} ${item.uom || ''}`, cols.qty, rowY, { width: 50, align: 'center' });
            doc.text(`₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, cols.rate, rowY, { width: 60, align: 'right' });
            doc.font('Helvetica-Bold').text(`₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, cols.amount, rowY, { width: 70, align: 'right' });
            rowY += 20;
        });

        // ── Totals ───────────────────────────────────────────────────────────
        rowY += 8;
        doc.moveTo(380, rowY).lineTo(doc.page.width - 40, rowY).strokeColor('#e5e7eb').stroke();
        rowY += 6;

        const totalRows = [
            ['Total Taxable', order.totalAmount || 0],
            order.totalGst > 0 ? ['Total GST', order.totalGst || 0] : null,
            order.freightAmount > 0 ? ['Freight', order.freightAmount || 0] : null,
        ].filter(Boolean);

        totalRows.forEach(([label, val]) => {
            doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
                .text(label, 380, rowY, { width: 120 });
            doc.text(`₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, cols.amount, rowY, { width: 70, align: 'right' });
            rowY += 15;
        });

        doc.moveTo(380, rowY).lineTo(doc.page.width - 40, rowY).strokeColor('#374151').stroke();
        rowY += 5;
        const grandTotal = order.roundedTotal || order.grandTotal || 0;
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#16a34a')
            .text('GRAND TOTAL', 380, rowY, { width: 120 });
        doc.text(`₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, cols.amount, rowY, { width: 70, align: 'right' });

        if (order.amountInWords) {
            rowY += 18;
            doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`In Words: ${order.amountInWords}`, 40, rowY);
        }

        // ── Footer ───────────────────────────────────────────────────────────
        const footerY = doc.page.height - 70;
        doc.moveTo(40, footerY).lineTo(doc.page.width - 40, footerY).strokeColor('#e5e7eb').stroke();
        doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
            .text('This is a computer generated document.', 40, footerY + 8, { align: 'center' });

        doc.end();
    });
};

// ── Main send handler ─────────────────────────────────────────────────────────
const sendOrder = catchAsync(async (req, res) => {
    const { type, id, channel, recipientName, email, phone, sendMode, groupName, subject, message } = req.body;

    // Fetch Settings
    let settings = await WhatsAppSettings.findOne();
    if (!settings) settings = await WhatsAppSettings.create({});

    const companyRes = await CompanyProfile.findOne();
    const company = companyRes || {};

    let order;
    if (type === 'Sales Order') {
        order = await SalesOrder.findById(id);
    } else {
        order = await PurchaseOrder.findById(id);
    }

    if (!order) {
        return res.status(httpStatus.NOT_FOUND).send({ message: 'Order not found' });
    }

    const log = await CommunicationLog.create({
        documentType: type,
        documentNumber: type === 'Sales Order' ? order.soNumber : order.poNumber,
        documentId: id,
        sentToName: recipientName,
        sentToEmail: email,
        sentToWhatsApp: phone,
        sentBy: req.user._id,
        channel,
        sendMode: sendMode || 'Number',
        groupName: groupName || '',
        status: 'Preparing PDF'
    });

    try {
        // 1. Generate PDF using PDFKit (no browser needed)
        const pdfBuffer = await generateOrderPDF(order, company, type);

        const safeDocNumber = log.documentNumber.replace(/[\/\\?%*:|"<>]/g, '-');
        const fileName = `${type === 'Sales Order' ? 'SO' : 'PO'}-${safeDocNumber}.pdf`;
        const tempFilePath = path.join(os.tmpdir(), fileName);
        fs.writeFileSync(tempFilePath, pdfBuffer);

        const results = [];

        if (channel === 'Email' || channel === 'Both') {
            log.status = 'Sending';
            await log.save();

            if (!company.emailSettings?.emailId) throw new Error('Email settings missing. Please configure Email in Settings.');
            await EmailService.sendEmail(company.emailSettings, {
                to: email,
                subject,
                text: message,
                attachments: [{ filename: fileName, content: pdfBuffer }]
            });
            results.push('Email sent');
        }

        if (channel === 'WhatsApp' || channel === 'Both') {
            await WhatsAppAutomationService.sendDocument({
                phone: sendMode === 'Number' ? phone : null,
                groupName: sendMode === 'Group' ? groupName : null,
                filePath: tempFilePath,
                caption: message,
                delays: {
                    searchDelay: settings.searchDelay,
                    attachDelay: settings.attachDelay,
                    sendDelay: settings.sendDelay
                },
                onStatusUpdate: async (status) => {
                    log.status = status;
                    await log.save();
                }
            });
            results.push('WhatsApp sent');
        }

        log.status = 'Sent';
        await log.save();

        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        res.status(httpStatus.OK).send({ message: 'Sent successfully', results });
    } catch (e) {
        log.status = 'Failed';
        log.errorMessage = e.message;
        await log.save();
        res.status(httpStatus.INTERNAL_SERVER_ERROR).send({ message: e.message });
    }
});

const getLogs = catchAsync(async (req, res) => {
    const { type, number } = req.query;
    const logs = await CommunicationLog.find({ documentType: type, documentNumber: number }).sort({ createdAt: -1 });
    res.send(logs);
});

export {
    sendOrder,
    getLogs
};
