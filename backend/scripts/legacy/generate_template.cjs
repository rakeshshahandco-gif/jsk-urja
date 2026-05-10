const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generate() {
    try {
        const dest = 'C:\\Users\\Admin\\Desktop\\Customer_Import_Template.xlsx';
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Customer Import');

        worksheet.columns = [
            { header: 'Customer Name*', key: 'customerName', width: 25 },
            { header: 'Company Name*', key: 'company', width: 25 },
            { header: 'Contact Person*', key: 'contactName', width: 20 },
            { header: 'Mobile Number*', key: 'mobile', width: 15 },
            { header: 'Alternative Mobile', key: 'mobile2', width: 15 },
            { header: 'Mobile 3', key: 'mobile3', width: 15 },
            { header: 'Mobile 4', key: 'mobile4', width: 15 },
            { header: 'Mobile 5', key: 'mobile5', width: 15 },
            { header: 'Email ID', key: 'email', width: 25 },
            { header: 'Address', key: 'address', width: 40 },
            { header: 'City', key: 'city', width: 20 },
            { header: 'State', key: 'state', width: 20 },
            { header: 'Pincode', key: 'pincode', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Business Type', key: 'customerType', width: 30 },
            { header: 'Interested Products', key: 'interestedProducts', width: 50 },
            { header: 'GST NO', key: 'gstNumber', width: 20 },
            { header: 'GST REGISTRATION TYPE', key: 'gstRegistrationType', width: 25 },
            { header: 'GST TYPE', key: 'gstType', width: 20 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

        worksheet.addRow({
            customerName: 'John Doe',
            company: 'ABC Corp',
            contactName: 'John Doe',
            mobile: '9876543210',
            email: 'john@abc.com',
            address: '123 Main St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            status: 'lead',
            customerType: 'dealer',
            gstNumber: '27AAAAA0000A1Z5',
            gstRegistrationType: 'Registered',
            gstType: 'CGST / SGST'
        });

        await workbook.xlsx.writeFile(dest);
        console.log('SUCCESS');
        process.exit(0);
    } catch (e) {
        console.error('ERROR:', e.message);
        process.exit(1);
    }
}

generate();
