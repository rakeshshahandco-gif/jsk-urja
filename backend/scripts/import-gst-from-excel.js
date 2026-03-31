import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import ExcelJS from 'exceljs';

dotenv.config({ path: './.env' });

const MONGODB_URL = process.env.MONGODB_URL;
const EXCEL_PATH = 'C:\\Users\\Admin\\Desktop\\Project\\GST MASTER DATA.xlsx';

if (!MONGODB_URL) {
    console.error('❌ MONGODB_URL not found in backend/.env');
    process.exit(1);
}

async function runGstImport() {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URL);
        const db = mongoose.connection.db;
        console.log('✅ Connected.');

        console.log(`📂 Reading Excel File: ${EXCEL_PATH}...`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(EXCEL_PATH);
        const worksheet = workbook.getWorksheet(1);
        console.log(`📊 Found ${worksheet.actualRowCount} rows.`);

        let updatedCount = 0;
        let matchCount = 0;
        let skipCount = 0;

        // Load all active customers for faster matching
        const customers = await db.collection('customers').find({ isDeleted: { $ne: true } }).toArray();

        // 1. Column Mapping (Assuming Col 1: GST, Col 2: Name)
        // GST format validation regex
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

        for (let i = 2; i <= worksheet.actualRowCount; i++) {
            const row = worksheet.getRow(i);
            const excelGst = String(row.getCell(1).value || '').trim().toUpperCase().replace(/\s+/g, '');
            const excelName = String(row.getCell(2).value || '').trim();
            const excelMobile = String(row.getCell(3).value || '').replace(/[^0-9]/g, '');

            if (!excelName && !excelMobile) continue;
            if (!gstRegex.test(excelGst)) {
                // console.log(`⏩ Skipping Row ${i}: Invalid GST ${excelGst}`);
                continue;
            }

            // Find Match in DB
            let match = customers.find(c => {
                const dbName = (c.company || c.customerName || '').toLowerCase().trim();
                return dbName === excelName.toLowerCase();
            });

            if (!match && excelMobile && excelMobile.length >= 10) {
                match = customers.find(c => {
                    const mobiles = (c.contactPersons || []).map(cp => (cp.mobile || '').replace(/[^0-9]/g, ''));
                    return mobiles.includes(excelMobile);
                });
            }

            if (match) {
                matchCount++;
                // Only update if current GST is missing or different
                if (!match.gstNumber || match.gstNumber !== excelGst) {
                    await db.collection('customers').updateOne(
                        { _id: match._id },
                        { $set: { 
                            gstNumber: excelGst,
                            gstRegistrationType: 'Registered',
                            gstType: excelGst.startsWith('27') ? 'CGST / SGST' : 'IGST'
                        } }
                    );
                    updatedCount++;
                } else {
                    skipCount++;
                }
            }
        }

        console.log('\n--- Sync Results ---');
        console.log(`Matched Rows: ${matchCount}`);
        console.log(`Updated Records: ${updatedCount}`);
        console.log(`Unchanged Records: ${skipCount}`);

        const finalWithGst = await db.collection('customers').countDocuments({
            isDeleted: { $ne: true },
            gstNumber: { $exists: true, $ne: '' }
        });
        console.log(`\nFinal Grand Total Customers with GST: ${finalWithGst}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ ERROR DURING SYNC:', error);
        process.exit(1);
    }
}

runGstImport();
