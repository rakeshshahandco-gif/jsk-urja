/**
 * Quick GSTR-1 Excel test - generates file and reports sheet row counts
 * Run: node test_gstr1_final.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register all needed models first
import '../src/models/salesInvoice.model.js';
import '../src/models/invoiceSeries.model.js';

console.log('🔌 Connecting to MongoDB...');
await mongoose.connect(process.env.MONGODB_URL);
console.log('✅ Connected!\n');

const { generateGSTR1Excel } = await import('../src/services/gstr1.service.js');

console.log('📊 Generating GSTR-1 Excel for April 2026...\n');

try {
    const buffer = await generateGSTR1Excel({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30'
    });

    const outPath = path.join(__dirname, 'test_gstr1_final.xlsx');
    fs.writeFileSync(outPath, buffer);
    console.log(`\n✅ Excel saved: ${outPath}`);
    console.log(`📦 Buffer size: ${buffer.length} bytes`);
    
    // Read back and check sheet row counts
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(outPath);
    
    console.log('\n📋 Sheet Row Counts:');
    wb.eachSheet((sheet, id) => {
        const rows = sheet.rowCount - 1; // minus header
        console.log(`  Sheet "${sheet.name}": ${rows} data rows`);
        
        // Print first 3 data rows for b2b sheet
        if (sheet.name === 'b2b' && rows > 0) {
            console.log('  B2B Sample Data:');
            sheet.eachRow((row, rn) => {
                if (rn > 1 && rn <= 4) {
                    const vals = row.values.slice(1); // remove index 0
                    console.log(`    Row ${rn-1}: ${vals.join(' | ')}`);
                }
            });
        }
        if (sheet.name === 'hsn' && rows > 0) {
            console.log('  HSN Sample Data:');
            sheet.eachRow((row, rn) => {
                if (rn > 1 && rn <= 4) {
                    const vals = row.values.slice(1);
                    console.log(`    Row ${rn-1}: ${vals.join(' | ')}`);
                }
            });
        }
    });
    
} catch(err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
}

await mongoose.disconnect();
console.log('\n✅ Done');
