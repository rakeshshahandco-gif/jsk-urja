import ExcelJS from 'exceljs';
import { exportItemTemplate } from './src/controllers/item.controller.js';

async function testExport() {
    console.log('Testing Export Template...');
    const req = {};
    const res = {
        setHeader: (name, value) => {
            console.log(`Setting header: ${name}=${value}`);
        },
        send: async (buffer) => {
            console.log('Buffer received, length:', buffer.length);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            const worksheet = workbook.getWorksheet('Items Template');
            const row1 = worksheet.getRow(1);
            const headers = [];
            row1.eachCell(cell => headers.push(cell.value));
            console.log('Headers found:', headers);
            
            const expectedHeaders = [
                'Item Code (Leave empty to auto-generate)',
                'Item Name*',
                'Description',
                'Category (RAW_MATERIAL, WIP, FINISHED_GOOD, TRADING, CONSUMABLE)',
                'Group',
                'Type',
                'HSN Code',
                'UOM*',
                'Opening Stock',
                'Faulty Stock',
                'Min Stock Level',
                'Selling Price',
                'Purchase Price',
                'Points (Leads)',
                'Valuation Rate (Cost)',
                'Active (TRUE/FALSE)'
            ];
            
            let missing = [];
            expectedHeaders.forEach(h => {
                if (!headers.includes(h)) missing.push(h);
            });
            
            if (missing.length === 0) {
                console.log('SUCCESS: All expected headers found.');
            } else {
                console.log('FAILURE: Missing headers:', missing);
            }
        }
    };

    try {
        await exportItemTemplate(req, res);
    } catch (e) {
        // If it fails because of database connection (asyncHandler might catch it), 
        // we might still have seen the headers if it reached the worksheet part.
        // Actually exportItemTemplate doesn't use the database!
        console.error('Export error:', e);
    }
}

testExport();
