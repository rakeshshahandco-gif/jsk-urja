import ExcelJS from 'exceljs';
import path from 'path';

async function generateTestExcel() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('GST Update');

    worksheet.columns = [
        { header: 'Company', key: 'company', width: 30 },
        { header: 'Customer Name', key: 'name', width: 30 },
        { header: 'Mobile', key: 'mobile', width: 15 },
        { header: 'GST No.', key: 'gst', width: 25 },
    ];

    // Case 1: Match by Company
    worksheet.addRow({ company: 'ABC CORP', name: '', mobile: '', gst: '27AAAAA0000A1Z5' });
    
    // Case 2: Match by Mobile
    worksheet.addRow({ company: '', name: '', mobile: '9988776655', gst: '27BBBBB0000B1Z5' });

    // Case 3: Match by Name
    worksheet.addRow({ company: '', name: 'SATIESH SIR', mobile: '', gst: '27CCCCC0000C1Z5' });

    // Case 4: Invalid GST Format
    worksheet.addRow({ company: 'TEST MAH', name: '', mobile: '', gst: 'INVALID-GST' });

    // Case 5: Customer Not Found
    worksheet.addRow({ company: 'NON-EXISTENT-CORP', name: '', mobile: '', gst: '27DDDDD0000D1Z5' });

    const filePath = path.resolve('GST_Update_Test.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Test Excel generated at: ${filePath}`);
}

generateTestExcel().catch(console.error);
