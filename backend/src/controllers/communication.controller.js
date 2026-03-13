import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import PDFService from '../services/pdf.service.js';
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

const sendOrder = catchAsync(async (req, res) => {
    const { type, id, channel, recipientName, email, phone, sendMode, groupName, subject, message } = req.body;
    
    // Fetch Settings
    let settings = await WhatsAppSettings.findOne();
    if (!settings) {
        settings = await WhatsAppSettings.create({});
    }

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
        // 1. Generate PDF
        // Note: In real implementation, this would use a more sophisticated HTML template
        // that matches the print layout.
        // 1. Generate professional HTML for PDF
        const itemsHtml = (order.items || []).map((item, i) => `
            <tr>
                <td style="border: 1px solid #000; padding: 6px; text-align: center;">${i + 1}</td>
                <td style="border: 1px solid #000; padding: 6px;">${item.itemName || item.itemCode}</td>
                <td style="border: 1px solid #000; padding: 6px; text-align: center;">${item.orderedQty || item.qty}</td>
                <td style="border: 1px solid #000; padding: 6px; text-align: center;">${item.uom}</td>
                <td style="border: 1px solid #000; padding: 6px; text-align: right;">₹${(item.rate || 0).toFixed(2)}</td>
                <td style="border: 1px solid #000; padding: 6px; text-align: right;">₹${((item.orderedQty || item.qty) * (item.rate || 0)).toFixed(2)}</td>
            </tr>
        `).join('');

        const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                        <div>
                            <div style="font-size: 24px; font-weight: bold; color: #000;">${company.companyName || 'JSK URJA'}</div>
                            <div style="font-size: 12px; margin-top: 5px; max-width: 400px;">
                                ${company.address || ''}<br/>
                                Phone: ${company.phone || ''} | Email: ${company.email || ''}<br/>
                                ${company.gstNumber ? `<strong>GSTIN: ${company.gstNumber}</strong>` : ''}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <h1 style="margin: 0; color: #64748b; font-size: 20px;">${type.toUpperCase()}</h1>
                            <div style="font-size: 18px; font-weight: bold; margin-top: 5px;">${log.documentNumber}</div>
                            <div style="font-size: 12px; margin-top: 5px;">Date: ${new Date(order.soDate || order.poDate || Date.now()).toLocaleDateString('en-IN')}</div>
                        </div>
                    </div>
                    <hr style="border: 1px solid #000; margin-bottom: 20px;"/>
                    <div style="display: flex; gap: 40px; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            <div style="font-size: 12px; font-weight: bold; color: #666; text-transform: uppercase;">Recipient:</div>
                            <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">${recipientName}</div>
                            <div style="font-size: 13px; margin-top: 5px;">
                                ${email ? `Email: ${email}<br/>` : ''}
                                ${phone ? `WhatsApp: ${phone}<br/>` : ''}
                            </div>
                        </div>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="border: 1px solid #000; padding: 8px;">Sr.</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: left;">Item Description</th>
                                <th style="border: 1px solid #000; padding: 8px;">Qty</th>
                                <th style="border: 1px solid #000; padding: 8px;">Unit</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: right;">Rate</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="border: none; padding: 10px;"></td>
                                <td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">Grand Total:</td>
                                <td style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold; font-size: 14px;">₹${(order.grandTotal || order.roundedTotal || 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div style="margin-top: 40px; font-size: 11px; color: #999; text-align: center;">
                        This is a computer generated document.
                    </div>
                </body>
            </html>
        `;

        const pdfBuffer = await PDFService.generatePDF(htmlContent);
        
        const fileName = `${type === 'Sales Order' ? 'SO' : 'PO'}-${log.documentNumber}.pdf`;
        const tempFilePath = path.join(os.tmpdir(), fileName);
        fs.writeFileSync(tempFilePath, pdfBuffer);

        const results = [];
        
        if (channel === 'Email' || channel === 'Both') {
            log.status = 'Sending';
            await log.save();

            if (!company.emailSettings?.emailId) throw new Error('Email settings missing');
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

        // Cleanup
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
