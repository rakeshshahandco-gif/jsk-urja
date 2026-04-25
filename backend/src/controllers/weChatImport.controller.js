import httpStatus from 'http-status';
import ExcelJS from 'exceljs';
import { WeChatContact } from '../models/weChatContact.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { WeChatProduct } from '../models/weChatProduct.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

export const importContacts = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Please upload an excel file');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet(1);

    const contacts = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        contacts.push({
            weChatDisplayName: row.getCell(1).value?.toString(),
            englishName: row.getCell(2).value?.toString(),
            chineseName: row.getCell(3).value?.toString(),
            weChatId: row.getCell(4).value?.toString(),
            companyName: row.getCell(5).value?.toString(),
            mobile: row.getCell(6).value?.toString(),
            role: row.getCell(7).value?.toString() || 'Unknown',
            source: row.getCell(8).value?.toString() || 'Other',
            isActive: true,
            createdBy: req.user._id
        });
    });

    // Bulk insertion with error handling for duplicates (WeChat ID is not unique in schema yet, but entryNo is)
    // We'll generate entry numbers
    for (const contact of contacts) {
        if (!contact.weChatDisplayName) continue;
        
        // Simple logic for entry number generation in loop (not ideal for huge imports, but okay for moderate ones)
        const lastContact = await WeChatContact.findOne().sort({ createdAt: -1 });
        let nextNum = 1;
        if (lastContact && lastContact.entryNo) {
            const match = lastContact.entryNo.match(/WCC-(\d+)/);
            if (match) nextNum = parseInt(match[1]) + 1;
        }
        contact.entryNo = `WCC-${String(nextNum).padStart(4, '0')}`;
        
        await WeChatContact.create(contact);
    }

    res.send(new ApiResponse(httpStatus.OK, null, `${contacts.length} contacts imported successfully`));
});
