import httpStatus from 'http-status';
import ExcelJS from 'exceljs';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { WeChatPriceRecord } from '../models/weChatPriceRecord.model.js';
import { WeChatSample } from '../models/weChatSample.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const exportContacts = asyncHandler(async (req, res) => {
    const contacts = await WeChatContact.find().sort('weChatDisplayName');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Contacts');

    worksheet.columns = [
        { header: 'Entry No', key: 'entryNo', width: 15 },
        { header: 'Display Name', key: 'weChatDisplayName', width: 25 },
        { header: 'English Name', key: 'englishName', width: 20 },
        { header: 'Chinese Name', key: 'chineseName', width: 20 },
        { header: 'WeChat ID', key: 'weChatId', width: 20 },
        { header: 'Company', key: 'companyName', width: 25 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'Role', key: 'role', width: 15 },
        { header: 'Source', key: 'source', width: 15 },
        { header: 'Status', key: 'isActive', width: 10 }
    ];

    contacts.forEach(contact => {
        worksheet.addRow({
            entryNo: contact.entryNo,
            weChatDisplayName: contact.weChatDisplayName,
            englishName: contact.englishName,
            chineseName: contact.chineseName,
            weChatId: contact.weChatId,
            companyName: contact.companyName,
            mobile: contact.mobile,
            role: contact.role,
            source: contact.source,
            isActive: contact.isActive ? 'Active' : 'Inactive'
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=wechat_contacts.xlsx');

    await workbook.xlsx.write(res);
    res.end();
});

export const exportPriceComparison = asyncHandler(async (req, res) => {
    const { productId } = req.query;
    if (!productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for comparison export');
    }

    const product = await WeChatProduct.findById(productId);
    const prices = await WeChatPriceRecord.find({ productId })
        .populate('contactId')
        .populate('groupId')
        .sort('price');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Price Comparison');

    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = `Price Comparison Report: ${product.productName} (${product.productCode})`;
    worksheet.getCell('A1').font = { bold: true, size: 14 };

    worksheet.addRow([]);
    worksheet.addRow(['Supplier / Group', 'Contact', 'Price', 'Currency', 'MOQ', 'Lead Time', 'Status', 'Date']);

    prices.forEach(p => {
        worksheet.addRow([
            p.groupId?.groupName || p.contactId?.companyName || 'Individual',
            p.contactId?.weChatDisplayName || 'Unknown',
            p.price,
            p.currency,
            p.moq,
            p.leadTimeDays + ' days',
            p.status,
            p.quotationDate.toLocaleDateString()
        ]);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=price_comparison_${product.productCode}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
});
