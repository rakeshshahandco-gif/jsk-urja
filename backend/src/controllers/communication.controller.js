import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import EmailService from '../services/email.service.js';
import CommunicationLog from '../models/communicationLog.model.js';
import { CompanyProfile } from '../models/companyProfile.model.js';
import WhatsAppSettings from '../models/whatsappSettings.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import WhatsAppService from '../services/whatsapp.service.js';
import PDFService from '../services/pdf.service.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getIO } from '../config/socket.js';

// Removed old generateDocumentPDF (PDFKit based)

// ── Main send handler ─────────────────────────────────────────────────────────
const sendOrder = catchAsync(async (req, res) => {
    const { type, id, channel, recipientName, email, phone, sendMode, groupName, groupId, subject, message } = req.body;

    // Fetch Settings
    let settings = await WhatsAppSettings.findOne();
    if (!settings) settings = await WhatsAppSettings.create({});

    const companyRes = await CompanyProfile.findOne();
    const company = companyRes || {};

    let order;
    if (type === 'Sales Order') {
        order = await SalesOrder.findById(id);
    } else if (type === 'Purchase Order') {
        order = await PurchaseOrder.findById(id);
    } else if (type === 'Sales Invoice') {
        order = await SalesInvoice.findById(id);
    }

    if (!order) {
        return res.status(httpStatus.NOT_FOUND).send({ message: 'Document not found' });
    }

    const isSOType = type === 'Sales Order';
    const docNumber = isSOType ? order.soNumber : (type === 'Sales Invoice' ? (order.displayInvoiceNumber || order.invoiceNumber) : order.poNumber);

    const log = await CommunicationLog.create({
        documentType: type,
        documentNumber: docNumber,
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
        console.log(`[Comm Debug] Generating ${type} professional PDF for doc number: ${docNumber}...`);
        
        // 1. Generate High-Quality PDF using Puppeteer
        const pdfBuffer = await PDFService.generateDocumentPDF(order, company, type, req.user);
        
        console.log(`[Comm Debug] PDF Buffer size: ${pdfBuffer.length} bytes`);

        const safeDocNumber = log.documentNumber.replace(/[\/\\?%*:|"<>]/g, '-');
        let prefix = 'SO';
        if (type === 'Purchase Order') prefix = 'PO';
        else if (type === 'Sales Invoice') prefix = 'INV';
        
        const fileName = `${prefix}-${safeDocNumber}.pdf`;
        const tempFilePath = path.join(os.tmpdir(), fileName);
        fs.writeFileSync(tempFilePath, pdfBuffer);

        const results = [];

        if (channel === 'Email' || channel === 'Both') {
            log.status = 'Sending Email';
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

        // 2. WhatsApp — send directly via Baileys (headless, no Chrome)
            log.status = 'Sending WhatsApp';
            await log.save();

            const caption = message || `Please find attached ${type}: ${log.documentNumber}`;

            // Get IO for real-time progress updates
            const io = getIO();
            const userRoom = `user:${req.user._id.toString()}`;

            io.to(userRoom).emit('comm:status', { documentId: id, channel: 'WhatsApp', status: 'Sending document via WhatsApp...', code: 'SENDING' });

            if (sendMode === 'Group') {
                // ── Group Mode: send by JID via this user's session ──────────
                if (!groupId) {
                    throw new Error('No group selected. Please pick a group from the list.');
                }
                await WhatsAppService.sendDocumentToGroup(req.user._id, {
                    groupId,
                    filePath: tempFilePath,
                    caption,
                    fileName,
                });
            } else {
                // ── Number Mode — via this user's WhatsApp session ────────────
                if (!phone || String(phone).replace(/\D/g, '').length < 10) {
                    throw new Error('A valid 10-digit WhatsApp number is required for Direct Number mode.');
                }
                await WhatsAppService.sendDocument(req.user._id, {
                    phone,
                    filePath: tempFilePath,
                    caption,
                    fileName,
                });
            }

            io.to(userRoom).emit('comm:status', { documentId: id, channel: 'WhatsApp', status: 'Sent successfully!', code: 'SUCCESS' });
            results.push('WhatsApp document sent');


        log.status = 'Sent / Prepared';
        await log.save();

        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        res.status(httpStatus.OK).send({ message: 'Operation completed successfully', results });
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

const downloadOrderPDF = catchAsync(async (req, res) => {
    const { type, id } = req.query;

    const companyRes = await CompanyProfile.findOne();
    const company = companyRes || {};

    let order;
    if (type === 'Sales Order') {
        order = await SalesOrder.findById(id);
    } else if (type === 'Purchase Order') {
        order = await PurchaseOrder.findById(id);
    } else if (type === 'Sales Invoice') {
        order = await SalesInvoice.findById(id);
    }

    if (!order) {
        return res.status(httpStatus.NOT_FOUND).send({ message: 'Order not found' });
    }

    const pdfBuffer = await PDFService.generateDocumentPDF(order, company, type, req.user);
    const isSOType = type === 'Sales Order';
    const docNumber = isSOType ? order.soNumber : (type === 'Sales Invoice' ? (order.displayInvoiceNumber || order.invoiceNumber) : order.poNumber);
    const safeDocNumber = docNumber.replace(/[\/\\?%*:|"<>]/g, '-');
    
    let prefix = 'SO';
    if (type === 'Purchase Order') prefix = 'PO';
    else if (type === 'Sales Invoice') prefix = 'INV';
    
    const fileName = `${prefix}-${safeDocNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(pdfBuffer);
});

export {
    sendOrder,
    getLogs,
    downloadOrderPDF
};
