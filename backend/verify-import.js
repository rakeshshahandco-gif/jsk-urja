import ExcelJS from 'exceljs';
import { importItemsExcel } from './src/controllers/item.controller.js';
import { Item } from './src/models/item.model.js';
import { ItemGroup } from './src/models/itemGroup.model.js';
import mongoose from 'mongoose';

// Mocking mongoose behavior
async function testImport() {
    console.log('Testing Import Logic...');
    
    // Create a mock Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.columns = [
        { header: 'Item Code', key: 'itemCode' },
        { header: 'Item Name*', key: 'itemName' },
        { header: 'Points (Leads)', key: 'points' },
        { header: 'Valuation Rate (Cost)', key: 'valuationRate' },
        { header: 'Category', key: 'category' }
    ];
    worksheet.addRow({
        itemCode: 'TEST-001',
        itemName: 'Test Item',
        points: '2 Point',
        valuationRate: 150.50,
        category: 'RAW_MATERIAL'
    });
    const buffer = await workbook.xlsx.writeBuffer();

    const req = {
        file: { buffer },
        user: { id: 'mock-user-id' }
    };

    let createdData = null;
    let updatedData = null;

    // Intercept Item.findOne and Item.create
    // We can't easily mock them because they are imports, but we can rely on manual inspection of the logic
    // OR we can mock them if we use a testing framework.
    // For now, let's just use a try-catch and see where it fails, 
    // but better, let's mock them on the model object.
    
    const originalFindOne = Item.findOne;
    const originalCreate = Item.create;
    const originalItemGroupFindOne = ItemGroup.findOne;

    Item.findOne = async () => null; // Assume it doesn't exist so it creates
    Item.create = async (data) => {
        createdData = data;
        console.log('Item.create called with:', JSON.stringify(data, null, 2));
        return data;
    };
    ItemGroup.findOne = async () => ({ _id: 'mock-group-id' });

    const res = {
        status: (code) => {
            console.log('Response status:', code);
            return res;
        },
        send: (data) => {
            console.log('Response data:', JSON.stringify(data, null, 2));
        }
    };

    const next = (err) => {
        if (err) {
            console.error('Next called with error:', err);
        }
    };

    try {
        console.log('Worksheet row count:', worksheet.rowCount);
        worksheet.eachRow((row, rowNumber) => {
            console.log(`Row ${rowNumber} values:`, row.values);
        });

        await new Promise((resolve, reject) => {
            const originalSend = res.send;
            res.send = (data) => {
                originalSend(data);
                resolve();
            };
            const originalNext = next;
            const wrappedNext = (err) => {
                originalNext(err);
                if (err) reject(err);
                else resolve();
            };
            importItemsExcel(req, res, wrappedNext);
        });
        
        if (createdData && createdData.points === '2 Point' && createdData.valuationRate === 150.50) {
            console.log('SUCCESS: Points and Valuation Rate correctly parsed and passed to create.');
        } else {
            console.log('FAILURE: Points or Valuation Rate missing/incorrect in created data.');
            console.log('Actual created data:', createdData);
        }
    } catch (e) {
        console.error('Import process failed with error:', e);
    } finally {
        // Restore
        Item.findOne = originalFindOne;
        Item.create = originalCreate;
        ItemGroup.findOne = originalItemGroupFindOne;
    }
}

testImport();
