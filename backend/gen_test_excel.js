import ExcelJS from 'exceljs';

const create = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Customers');
    sheet.addRow(['Company', 'Customer Name', 'Mobile', 'Email', 'State', 'Status', 'Product', 'Note']);
    sheet.addRow(['Test Co Auto', 'Test User Auto', '9998887776', 'auto@test.com', 'State', 'New', 'Product', 'Note']);

    await workbook.xlsx.writeFile('test_harness.xlsx');
    console.log('Created test_harness.xlsx');
};

create();
